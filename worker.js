addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/git/')) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    // isomorphic-git sends paths like /git/gist.github.com/USERNAME/REPO.git/info/refs
    const targetPath = url.pathname.substring(5); // remove /git/
    // Since isomorphic-git sends the full hostname in the path, we can just use https://
    const targetUrl = 'https://' + targetPath + url.search;
    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });

    const response = await fetch(modifiedRequest);
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');

    // Do NOT add Cache-Control, git relies on accurate fresh responses.

    return modifiedResponse;
  }

  // existing danbooru proxy logic...
  if (url.pathname === '/proxy') {
    const target = url.searchParams.get('url');
    if (!target) return new Response('Missing url', {status: 400});
    const modifiedRequest = new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.body
    });
    return fetch(modifiedRequest);
  }

  return new Response('Not found', { status: 404 });
}
