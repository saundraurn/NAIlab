const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const BASE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };
const JSON_HEADERS = { ...BASE_HEADERS, 'Content-Type': 'application/json' };
const CONVO_RE = /^conversations\/([^/]+)$/;
const IMG_RE = /^conversations\/([^/]+)\/images\/([^/]+)$/;

function decTitle(encoded) {
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

function makeEntry(id, meta) {
  const ts = Number(meta?.timestamp);
  return { id, title: meta?.title ? decTitle(meta.title) : 'Cloud Chat', timestamp: Number.isFinite(ts) ? ts : Date.now() };
}

function corsJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

function etagCheck(obj, request, headers) {
  const etag = obj.httpEtag;
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (etag && ifNoneMatch && etag === ifNoneMatch) {
    return new Response(null, { status: 304, headers: BASE_HEADERS });
  }
  if (etag) headers['ETag'] = etag;
  return null;
}

async function handleCrud(request, env, key, contentType) {
  if (request.method === 'GET') {
    const obj = await env.BUCKET.get(key);
    if (!obj) return corsResponse('Not found', 404);
    return new Response(obj.body, {
      headers: { ...CORS_HEADERS, 'Content-Type': obj.httpMetadata?.contentType || contentType },
    });
  }
  if (request.method === 'PUT') {
    await env.BUCKET.put(key, request.body, {
      httpMetadata: { contentType: request.headers.get('Content-Type') || contentType },
    });
    return corsResponse('OK');
  }
  if (request.method === 'DELETE') {
    await env.BUCKET.delete(key);
    return corsResponse('OK');
  }
  return null;
}

// ── Conversation index helpers ──────────────────────────────────────────────
async function readIndex(env) {
  try {
    const obj = await env.BUCKET.get('conversations/index.json');
    if (obj) {
      const data = await obj.json();
      if (Array.isArray(data)) return data;
    }
  } catch {}
  // Rebuild from listing + head when index is missing or corrupt
  const ids = [];
  let cursor;
  do {
    const list = await env.BUCKET.list({
      prefix: 'conversations/',
      delimiter: '/',
      ...(cursor && { cursor }),
    });
    for (const prefix of list.delimitedPrefixes || []) {
      const id = prefix.replace('conversations/', '').replace(/\/$/, '');
      if (id) ids.push(id);
    }
    cursor = list.truncated && list.cursor;
  } while (cursor);
  const convos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const results = await Promise.all(batch.map(async (id) => {
      try {
        const head = await env.BUCKET.head(`conversations/${id}/conversation.json`);
        return head ? makeEntry(id, head.customMetadata) : null;
      } catch { return null; }
    }));
    convos.push(...results.filter(Boolean));
  }
  await writeIndex(env, convos);
  return convos;
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
      const headers = { ...JSON_HEADERS };
      const cached = etagCheck(obj, request, headers);
      if (cached) return cached;
      return new Response(obj.body, { headers });
    }
    if (request.method === 'PUT') {
      await env.BUCKET.put('config.json', request.body, {
        httpMetadata: { contentType: 'application/json' },
      });
      return corsResponse('OK');
    }
  }

  // ── Conversations list (reads from index) ────────────────────────────────
  if (path === 'conversations' && request.method === 'GET') {
    const obj = await env.BUCKET.get('conversations/index.json');
    if (obj) {
      const headers = { ...JSON_HEADERS };
      const cached = etagCheck(obj, request, headers);
      if (cached) return cached;
      try {
        const text = await obj.text();
        if (Array.isArray(JSON.parse(text))) return new Response(text, { headers });
      } catch {}
    }
    return corsJson(await readIndex(env));
  }

  // ── Single conversation (JSON) ───────────────────────────────────────────
  const convoMatch = path.match(CONVO_RE);
  if (convoMatch) {
    const convoId = convoMatch[1];
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(`conversations/${convoId}/conversation.json`);
      if (!obj) return corsResponse('Not found', 404);
      const headers = { ...JSON_HEADERS };
      const cached = etagCheck(obj, request, headers);
      if (cached) return cached;
      const cm = obj.customMetadata || {};
      if (cm.title) headers['X-Convo-Title'] = cm.title;
      if (cm.timestamp) headers['X-Convo-Timestamp'] = cm.timestamp;
      const isGzip = obj.httpMetadata?.contentEncoding === 'gzip';
      if (isGzip) headers['Content-Encoding'] = 'gzip';
      return new Response(obj.body, {
        ...(isGzip && { encodeBody: 'manual' }),
        headers,
      });
    }
    if (request.method === 'PUT') {
      const titleHeader = request.headers.get('X-Convo-Title');
      const timestampHeader = request.headers.get('X-Convo-Timestamp');
      const contentEncoding = request.headers.get('Content-Encoding');
      const putOptions = { httpMetadata: { contentType: 'application/json', ...(contentEncoding && { contentEncoding }) } };
      if (titleHeader || timestampHeader) {
        putOptions.customMetadata = {
          ...(titleHeader && {title: titleHeader}),
          ...(timestampHeader && {timestamp: timestampHeader})
        };
      }
      const putResult = await env.BUCKET.put(
        `conversations/${convoId}/conversation.json`,
        request.body,
        putOptions
      );
      const index = await readIndex(env);
      const entry = makeEntry(convoId, { title: titleHeader, timestamp: timestampHeader });
      const idx = index.findIndex(e => e.id === convoId);
      if (idx !== -1) index[idx] = entry; else index.push(entry);
      await writeIndex(env, index);
      return corsResponse('OK', 200, putResult?.httpEtag && { 'ETag': putResult.httpEtag });
    }
    if (request.method === 'DELETE') {
      let cursor;
      do {
        const list = await env.BUCKET.list({
          prefix: `conversations/${convoId}/`,
          ...(cursor && { cursor }),
        });
        const keys = list.objects.map(o => o.key);
        if (keys.length) await env.BUCKET.delete(keys);
        cursor = list.truncated && list.cursor;
      } while (cursor);
      const index = await readIndex(env);
      const filtered = index.filter(e => e.id !== convoId);
      if (filtered.length !== index.length) await writeIndex(env, filtered);
      return corsResponse('OK');
    }
  }

  // ── Conversation images ──────────────────────────────────────────────────
  const imgMatch = path.match(IMG_RE);
  if (imgMatch) {
    const res = await handleCrud(request, env, `conversations/${imgMatch[1]}/${imgMatch[2]}`, 'image/webp');
    if (res) return res;
  }

  // ── Storage usage ──────────────────────────────────────────────────────────
  if (path === 'usage' && request.method === 'GET') {
    let totalSize = 0, objectCount = 0, cursor;
    do {
      const list = await env.BUCKET.list(cursor ? { cursor } : {});
      for (const obj of list.objects) { totalSize += obj.size; objectCount++; }
      cursor = list.truncated && list.cursor;
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
