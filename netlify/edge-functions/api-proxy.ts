const unavailable = (code: string, message: string, status: number) => new Response(JSON.stringify({ error: { code, message } }), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async function apiProxy(request: Request): Promise<Response> {
  const configured = Netlify.env.get('TAILSCALE_FUNNEL_ORIGIN');
  if (!configured) return unavailable('DEMO_PROXY_NOT_CONFIGURED', 'TAILSCALE_FUNNEL_ORIGIN não foi configurada.', 503);

  let origin: URL;
  try { origin = new URL(configured); } catch { return unavailable('DEMO_PROXY_NOT_CONFIGURED', 'TAILSCALE_FUNNEL_ORIGIN é inválida.', 503); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || (origin.pathname !== '/' && origin.pathname !== '')) {
    return unavailable('DEMO_PROXY_NOT_CONFIGURED', 'TAILSCALE_FUNNEL_ORIGIN deve ser uma origem HTTPS sem caminho.', 503);
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return unavailable('DEMO_API_UNAVAILABLE', 'A API de demonstração está indisponível.', 502);
  }
}
