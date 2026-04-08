addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // ── Git CORS proxy for isomorphic-git ─────────────────────────────────────
  if (url.pathname.startsWith('/git/')) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const targetPath = url.pathname.substring(5); // strip /git/
    const targetUrl = 'https://' + targetPath + url.search;

    // Copy headers, explicitly preserving Authorization for git auth.
    const headers = new Headers(request.headers);

    // GET/HEAD must not carry a body (Fetch spec violation in some runtimes).
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

    // Buffer the body upfront so it can survive redirect retries.
    // ReadableStream is consumed on first fetch(); without buffering the body
    // would be empty on any subsequent redirect hop, breaking git push.
    const bodyBuffer = hasBody ? await request.arrayBuffer() : null;

    // Follow redirects manually so we can re-attach auth headers on each hop.
    // Cloudflare's redirect:'follow' drops Authorization on cross-origin redirects.
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

      // Follow 3xx while keeping auth intact.
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
    modifiedResponse.headers.set('Cache-Control', 'no-store');
    return modifiedResponse;
  }

  // ── Danbooru image proxy ───────────────────────────────────────────────────
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

  return new Response('Not found', { status: 404 });
}
