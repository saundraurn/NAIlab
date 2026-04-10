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

const corsHeaders = (extra = {}) => ({ ...CORS_HEADERS, ...NO_CACHE_HEADERS, ...extra });
const corsJson = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: corsHeaders({ 'Content-Type': 'application/json', ...extra }) });
const corsResponse = (body, status = 200, extra = {}) => new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
const decTitle = (raw) => { try { return decodeURIComponent(raw); } catch { return raw; } };
const mkEntry = (id, title, ts) => ({ id, title: title || 'Cloud Chat', timestamp: Number.isFinite(ts) ? ts : Date.now() });

function etagCheck(obj, request, headers) {
  const etag = obj?.httpEtag;
  if (etag && request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: corsHeaders() });
  if (etag) headers['ETag'] = etag;
  return null;
}

async function handleCrud(request, env, key, contentType = 'application/json') {
  if (request.method === 'GET') {
    const obj = await env.BUCKET.get(key);
    if (!obj) return corsResponse('Not found', 404);
    return new Response(obj.body, { headers: { ...CORS_HEADERS, ...(contentType === 'application/json' ? NO_CACHE_HEADERS : {}), 'Content-Type': obj.httpMetadata?.contentType || contentType } });
  }
  if (request.method === 'PUT') {
    await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: request.headers.get('Content-Type') || contentType } });
    return corsResponse('OK');
  }
  if (request.method === 'DELETE') {
    await env.BUCKET.delete(key);
    return corsResponse('OK');
  }
}

async function listAll(env, opts) {
  const all = [];
  let cursor;
  do {
    const list = await env.BUCKET.list(cursor ? { ...opts, cursor } : opts);
    all.push(list);
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);
  return all;
}

// ── Conversation index helpers ──────────────────────────────────────────────
async function readIndex(env) {
  try {
    const obj = await env.BUCKET.get('conversations/index.json');
    if (obj) { const data = await obj.json(); if (Array.isArray(data)) return data; }
  } catch {}
  const ids = [];
  for (const page of await listAll(env, { prefix: 'conversations/', delimiter: '/' })) {
    for (const prefix of page.delimitedPrefixes || []) {
      const id = prefix.replace('conversations/', '').replace(/\/$/, '');
      if (id) ids.push(id);
    }
  }
  const convos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const results = await Promise.all(ids.slice(i, i + 50).map(async (id) => {
      try {
        const head = await env.BUCKET.head(`conversations/${id}/manifest.json`);
        if (!head) return null;
        const meta = head.customMetadata || {};
        return mkEntry(id, meta.title ? decTitle(meta.title) : null, Number(meta.timestamp));
      } catch { return null; }
    }));
    convos.push(...results.filter(Boolean));
  }
  await writeIndex(env, convos);
  return convos;
}

async function writeIndex(env, index) {
  await env.BUCKET.put('conversations/index.json', JSON.stringify(index), { httpMetadata: { contentType: 'application/json' } });
}

// ── R2 Storage API ─────────────────────────────────────────────────────────
async function handleR2(request, env, url) {
  const path = url.pathname.substring(4);

  // ── Config ───────────────────────────────────────────────────────────────
  if (path === 'config') {
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get('config.json');
      if (!obj) return corsJson({});
      const headers = corsHeaders({ 'Content-Type': 'application/json' });
      const r = etagCheck(obj, request, headers);
      if (r) return r;
      return new Response(obj.body, { headers });
    }
    if (request.method === 'PUT') {
      await env.BUCKET.put('config.json', request.body, { httpMetadata: { contentType: 'application/json' } });
      return corsResponse('OK');
    }
  }

  // ── Conversations list ────────────────────────────────────────────────
  if (path === 'conversations' && request.method === 'GET') {
    const obj = await env.BUCKET.get('conversations/index.json');
    if (obj) {
      const headers = corsHeaders({ 'Content-Type': 'application/json' });
      const r = etagCheck(obj, request, headers);
      if (r) return r;
      let data;
      try { data = await obj.json(); } catch {}
      if (Array.isArray(data)) return new Response(JSON.stringify(data), { headers });
    }
    return corsJson(await readIndex(env));
  }

  // ── Conversation manifest ────────────────────────────────────────────────
  const manifestMatch = path.match(/^conversations\/([^/]+)\/manifest$/);
  if (manifestMatch) {
    const convoId = manifestMatch[1];
    if (request.method === 'GET') {
      const obj = await env.BUCKET.get(`conversations/${convoId}/manifest.json`);
      if (!obj) return corsResponse('Not found', 404);
      const headers = corsHeaders({ 'Content-Type': 'application/json' });
      const r = etagCheck(obj, request, headers);
      if (r) return r;
      const cm = obj.customMetadata || {};
      if (cm.title) headers['X-Convo-Title'] = cm.title;
      if (cm.timestamp) headers['X-Convo-Timestamp'] = cm.timestamp;
      return new Response(obj.body, { headers });
    }
    if (request.method === 'PUT') {
      const titleHeader = request.headers.get('X-Convo-Title');
      const timestampHeader = request.headers.get('X-Convo-Timestamp');
      const putOptions = { httpMetadata: { contentType: 'application/json' },
        ...((titleHeader || timestampHeader) && { customMetadata: { ...(titleHeader && { title: titleHeader }), ...(timestampHeader && { timestamp: timestampHeader }) } })
      };
      const putResult = await env.BUCKET.put(`conversations/${convoId}/manifest.json`, request.body, putOptions);
      const index = await readIndex(env);
      const entry = mkEntry(convoId, titleHeader ? decTitle(titleHeader) : null, Number(timestampHeader));
      const idx = index.findIndex(e => e.id === convoId);
      if (idx !== -1) index[idx] = entry; else index.push(entry);
      await writeIndex(env, index);
      return corsResponse('OK', 200, putResult?.httpEtag ? { 'ETag': putResult.httpEtag } : {});
    }
  }

  // ── Per-message files ────────────────────────────────────────────────────
  const msgMatch = path.match(/^conversations\/([^/]+)\/messages\/([^/]+)$/);
  if (msgMatch) return handleCrud(request, env, `conversations/${msgMatch[1]}/messages/${msgMatch[2]}.json`);

  // ── Delete entire conversation ────────────────────────────────────────
  const convoDeleteMatch = path.match(/^conversations\/([^/]+)$/);
  if (convoDeleteMatch && request.method === 'DELETE') {
    const convoId = convoDeleteMatch[1];
    for (const page of await listAll(env, { prefix: `conversations/${convoId}/` })) {
      const keys = page.objects.map(o => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
    }
    const index = await readIndex(env);
    const filtered = index.filter(e => e.id !== convoId);
    if (filtered.length !== index.length) await writeIndex(env, filtered);
    return corsResponse('OK');
  }

  // ── Conversation images ──────────────────────────────────────────────────
  const imgMatch = path.match(/^conversations\/([^/]+)\/images\/([^/]+)$/);
  if (imgMatch) return handleCrud(request, env, `conversations/${imgMatch[1]}/${imgMatch[2]}`, 'image/webp');

  // ── Storage usage ──────────────────────────────────────────────────────────
  if (path === 'usage' && request.method === 'GET') {
    let totalSize = 0, objectCount = 0;
    for (const page of await listAll(env, {})) {
      for (const obj of page.objects) { totalSize += obj.size; objectCount++; }
    }
    return corsJson({ totalBytes: totalSize, objectCount });
  }

  return corsResponse('Not found', 404);
}

// ── Allowed proxy hosts ─────────────────────────────────────────────────────
const PROXY_ALLOWED_HOSTS = new Set(['cdn.donmai.us', 'danbooru.donmai.us']);

// ── Main handler ───────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (url.pathname === '/proxy') {
      const target = url.searchParams.get('url');
      if (!target) return new Response('Missing url', { status: 400 });
      let targetUrl;
      try { targetUrl = new URL(target); } catch { return new Response('Invalid url', { status: 400 }); }
      if (!PROXY_ALLOWED_HOSTS.has(targetUrl.hostname)) return new Response('Proxy target host not allowed', { status: 403 });
      const fwdHeaders = new Headers(request.headers);
      fwdHeaders.delete('Authorization');
      fwdHeaders.delete('Cookie');
      try {
        const upstream = await fetch(new Request(target, {
          method: request.method, headers: fwdHeaders,
          body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        }));
        const resp = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: new Headers(upstream.headers) });
        resp.headers.set('Access-Control-Allow-Origin', '*');
        return resp;
      } catch (err) { return new Response(`Proxy fetch failed: ${err.message}`, { status: 502 }); }
    }
    if (url.pathname.startsWith('/r2/')) {
      if (!env.R2_AUTH_SECRET) return corsResponse('R2_AUTH_SECRET not configured', 500);
      const auth = request.headers.get('Authorization');
      if (!auth || auth !== `Bearer ${env.R2_AUTH_SECRET}`) return corsResponse('Unauthorized', 401);
      return handleR2(request, env, url);
    }
    return new Response('Not found', { status: 404 });
  },
};
