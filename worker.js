const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

function corsJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

// ── Conversations index helpers ─────────────────────────────────────────────
async function readIndex(env) {
  try {
    const obj = await env.BUCKET.get('conversations/index.json');
    if (obj) {
      const data = await obj.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}
  // Rebuild index from bucket listing on missing/corrupt index
  const ids = [];
  let cursor;
  do {
    const list = await env.BUCKET.list({
      prefix: 'conversations/',
      delimiter: '/',
      ...(cursor ? { cursor } : {}),
    });
    for (const prefix of list.delimitedPrefixes || []) {
      const id = prefix.replace('conversations/', '').replace(/\/$/, '');
      if (id) ids.push(id);
    }
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);
  const BATCH = 50;
  const entries = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (id) => {
      try {
        const head = await env.BUCKET.head(`conversations/${id}/conversation.json`);
        if (!head) return null;
        const meta = head.customMetadata || {};
        let title = 'Cloud Chat';
        if (meta.title) { try { title = decodeURIComponent(meta.title); } catch { title = meta.title; } }
        const ts = Number(meta.timestamp);
        return { id, title, timestamp: Number.isFinite(ts) ? ts : Date.now() };
      } catch { return null; }
    }));
    entries.push(...results.filter(Boolean));
  }
  await writeIndex(env, entries);
  return entries;
}

async function writeIndex(env, index) {
  await env.BUCKET.put('conversations/index.json', JSON.stringify(index), {
    httpMetadata: { contentType: 'application/json' },
  });
}

// ── R2 Storage API ─────────────────────────────────────────────────────────
async function handleR2(request, env, url) {
  const path = url.pathname.substring(4); // strip /r2/

  // ── Config ───────────────────────────────────────────────────────────────
  if (path === 'config') {
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get('config.json');
      if (!obj) return corsJson({});
      const headers = { ...CORS_HEADERS, ...NO_CACHE_HEADERS, 'Content-Type': 'application/json' };
      if (obj.httpEtag) headers['ETag'] = obj.httpEtag;
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch && obj.httpEtag && ifNoneMatch === obj.httpEtag) {
        return corsResponse(null, 304);
      }
      return new Response(obj.body, { headers });
    }
    if (request.method === 'PUT') {
      await env.BUCKET.put('config.json', request.body, {
        httpMetadata: { contentType: 'application/json' },
      });
      return corsResponse('OK');
    }
  }

  // ── Conversations list ───────────────────────────────────────────────────
  if (path === 'conversations' && request.method === 'GET') {
    const index = await readIndex(env);
    return corsJson(index);
  }

  // ── Single conversation (JSON) ───────────────────────────────────────────
  const convoMatch = path.match(/^conversations\/([^/]+)$/);
  if (convoMatch) {
    const convoId = convoMatch[1];
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(`conversations/${convoId}/conversation.json`);
      if (!obj) return corsResponse('Not found', 404);
      return new Response(obj.body, {
        headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'PUT') {
      const title = request.headers.get('X-Convo-Title');
      const timestamp = request.headers.get('X-Convo-Timestamp');
      const putOptions = { httpMetadata: { contentType: 'application/json' } };
      if (title || timestamp) {
        const customMetadata = {};
        if (title) customMetadata.title = title;
        if (timestamp) customMetadata.timestamp = timestamp;
        putOptions.customMetadata = customMetadata;
      }
      await env.BUCKET.put(
        `conversations/${convoId}/conversation.json`,
        request.body,
        putOptions
      );
      // Update conversations index
      const decodedTitle = title ? (() => { try { return decodeURIComponent(title); } catch { return title; } })() : 'Cloud Chat';
      const ts = Number(timestamp);
      const index = await readIndex(env);
      const existing = index.findIndex(e => e.id === convoId);
      const entry = { id: convoId, title: decodedTitle, timestamp: Number.isFinite(ts) ? ts : Date.now() };
      if (existing !== -1) index[existing] = entry;
      else index.push(entry);
      await writeIndex(env, index);
      return corsResponse('OK');
    }
    if (request.method === 'DELETE') {
      let cursor;
      do {
        const list = await env.BUCKET.list({
          prefix: `conversations/${convoId}/`,
          ...(cursor ? { cursor } : {}),
        });
        const keys = list.objects.map(o => o.key);
        if (keys.length) await env.BUCKET.delete(keys);
        cursor = list.truncated ? list.cursor : null;
      } while (cursor);
      // Remove from conversations index
      const index = await readIndex(env);
      const filtered = index.filter(e => e.id !== convoId);
      if (filtered.length !== index.length) await writeIndex(env, filtered);
      return corsResponse('OK');
    }
  }

  // ── Conversation images ──────────────────────────────────────────────────
  const imgMatch = path.match(/^conversations\/([^/]+)\/images\/([^/]+)$/);
  if (imgMatch) {
    const [, convoId, imageId] = imgMatch;
    const key = `conversations/${convoId}/${imageId}`;
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(key);
      if (!obj) return corsResponse('Not found', 404);
      return new Response(obj.body, {
        headers: { ...CORS_HEADERS, 'Content-Type': obj.httpMetadata?.contentType || 'image/webp' },
      });
    }
    if (request.method === 'PUT') {
      await env.BUCKET.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'image/webp' },
      });
      return corsResponse('OK');
    }
    if (request.method === 'DELETE') {
      await env.BUCKET.delete(key);
      return corsResponse('OK');
    }
  }

  // ── Storage usage ──────────────────────────────────────────────────────────
  if (path === 'usage' && request.method === 'GET') {
    let totalSize = 0;
    let objectCount = 0;
    let cursor;
    do {
      const list = await env.BUCKET.list(cursor ? { cursor } : {});
      for (const obj of list.objects) {
        totalSize += obj.size;
        objectCount++;
      }
      cursor = list.truncated ? list.cursor : null;
    } while (cursor);
    return corsJson({ totalBytes: totalSize, objectCount });
  }

  return corsResponse('Not found', 404);
}

// ── Allowed proxy hosts ─────────────────────────────────────────────────────
const PROXY_ALLOWED_HOSTS = new Set([
  'cdn.donmai.us',
  'danbooru.donmai.us',
]);

// ── Main handler ───────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight for any route
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Danbooru image proxy — restricted to allowed hosts
    if (url.pathname === '/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return new Response('Missing url', { status: 400 });
      let targetUrl;
      try { targetUrl = new URL(target); } catch { return new Response('Invalid url', { status: 400 }); }
      if (!PROXY_ALLOWED_HOSTS.has(targetUrl.hostname)) {
        return new Response('Proxy target host not allowed', { status: 403 });
      }
      // Strip sensitive headers before forwarding
      const fwdHeaders = new Headers(request.headers);
      fwdHeaders.delete('Authorization');
      fwdHeaders.delete('Cookie');
      try {
        const upstream = await fetch(new Request(target, {
          method: request.method,
          headers: fwdHeaders,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        }));
        // Add CORS headers to upstream response
        const resp = new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: new Headers(upstream.headers),
        });
        resp.headers.set('Access-Control-Allow-Origin', '*');
        return resp;
      } catch (err) {
        return new Response(`Proxy fetch failed: ${err.message}`, { status: 502 });
      }
    }

    // R2 Storage API — requires auth
    if (url.pathname.startsWith('/r2/')) {
      if (!env.R2_AUTH_SECRET) {
        return corsResponse('R2_AUTH_SECRET not configured', 500);
      }
      const auth = request.headers.get('Authorization');
      if (!auth || auth !== `Bearer ${env.R2_AUTH_SECRET}`) {
        return corsResponse('Unauthorized', 401);
      }
      return handleR2(request, env, url);
    }

    return new Response('Not found', { status: 404 });
  },
};
