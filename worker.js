const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

// ── R2 Storage API ─────────────────────────────────────────────────────────
async function handleR2(request, env, url) {
  const path = url.pathname.substring(4); // strip /r2/

  // ── Config ───────────────────────────────────────────────────────────────
  if (path === 'config') {
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get('config.json');
      if (!obj) return corsJson({});
      const headers = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
      if (obj.httpEtag) headers['ETag'] = obj.httpEtag;
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
    return corsJson(ids);
  }

  // ── Single conversation (JSON) ───────────────────────────────────────────
  const convoMatch = path.match(/^conversations\/([^/]+)$/);
  if (convoMatch) {
    const convoId = convoMatch[1];
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(`conversations/${convoId}/conversation.json`);
      if (!obj) return corsResponse('Not found', 404);
      return new Response(obj.body, {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'PUT') {
      await env.BUCKET.put(
        `conversations/${convoId}/conversation.json`,
        request.body,
        { httpMetadata: { contentType: 'application/json' } }
      );
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
  }

  // ── List images for a conversation ───────────────────────────────────────
  const listImgMatch = path.match(/^conversations\/([^/]+)\/images$/);
  if (listImgMatch && request.method === 'GET') {
    const convoId = listImgMatch[1];
    const images = [];
    let cursor;
    do {
      const list = await env.BUCKET.list({
        prefix: `conversations/${convoId}/img_`,
        ...(cursor ? { cursor } : {}),
      });
      for (const obj of list.objects) {
        const name = obj.key.split('/').pop();
        if (name) images.push(name);
      }
      cursor = list.truncated ? list.cursor : null;
    } while (cursor);
    return corsJson(images);
  }

  return corsResponse('Not found', 404);
}

// ── Git CORS proxy for isomorphic-git ──────────────────────────────────────
async function handleGitProxy(request, url) {
  const targetPath = url.pathname.substring(5); // strip /git/
  const targetUrl = 'https://' + targetPath + url.search;

  const headers = new Headers(request.headers);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const bodyBuffer = hasBody ? await request.arrayBuffer() : null;

  let fetchUrl = targetUrl;
  let response;
  for (let hops = 0; hops < 5; hops++) {
    try {
      response = await fetch(new Request(fetchUrl, {
        method: request.method,
        headers,
        body: bodyBuffer,
        redirect: 'manual',
      }));
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) break;
      fetchUrl = location;
      continue;
    }
    break;
  }

  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
  modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
  modifiedResponse.headers.set('Access-Control-Expose-Headers', '*');
  return modifiedResponse;
}

// ── Main handler ───────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight for any route
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Git CORS proxy
    if (url.pathname.startsWith('/git/')) {
      return handleGitProxy(request, url);
    }

    // Danbooru image proxy
    if (url.pathname === '/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return new Response('Missing url', { status: 400 });
      try {
        return await fetch(new Request(target, {
          method: request.method,
          headers: request.headers,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        }));
      } catch (err) {
        return new Response(`Proxy fetch failed: ${err.message}`, { status: 502 });
      }
    }

    // R2 Storage API — requires auth
    if (url.pathname.startsWith('/r2/')) {
      const auth = request.headers.get('Authorization');
      if (!env.R2_AUTH_SECRET || !auth || auth !== `Bearer ${env.R2_AUTH_SECRET}`) {
        return corsResponse('Unauthorized', 401);
      }
      return handleR2(request, env, url);
    }

    return new Response('Not found', { status: 404 });
  },
};
