// ============================================================
// Cloudflare Worker entry point con Static Assets binding.
// ============================================================
// El proyecto esta desplegado como Worker with Static Assets
// (perks.deimerromeromadera.workers.dev / perks.savvytrix.com).
// En ese modelo la carpeta functions/ NO se lee — hay que usar este
// archivo _worker.js que Cloudflare detecta especialmente cuando esta
// en la raiz de los assets y lo trata como script del Worker en vez
// de servirlo como archivo estatico.
//
// Reglas:
//   1) GET /verify/:code   -> proxy al backend Render preservando el
//      302 Location. El browser sigue el redirect a /r/:id?b=:code
//      dentro del mismo dominio, donde Angular Router carga
//      raffle-promo con auto-verify por ?b query param.
//
//   2) Cualquier otra ruta -> se delega a env.ASSETS.fetch(request).
//      Si el asset no existe (404), servimos index.html como fallback
//      para que Angular Router maneje la ruta (SPA behavior).
// ============================================================

const BACKEND_URL = 'https://rifas-nehd.onrender.com';
const VERIFY_RE = /^\/verify\/([^/?#]+)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==== 1) Proxy /verify/:code al backend ====
    const m = url.pathname.match(VERIFY_RE);
    if (m) {
      const code = m[1];
      const upstream = `${BACKEND_URL}/v/${encodeURIComponent(code)}`;
      const proxied = await fetch(upstream, {
        method: request.method,
        headers: request.headers,
        redirect: 'manual',
      });
      return new Response(proxied.body, {
        status: proxied.status,
        statusText: proxied.statusText,
        headers: proxied.headers,
      });
    }

    // ==== 2) Static assets (con SPA fallback) ====
    const assetResp = await env.ASSETS.fetch(request);

    // Si el asset devolvio 404, servir index.html para que Angular
    // Router tome control de la ruta (SPA). Cache-control ya lo pone
    // el mismo bundle en _headers.
    if (assetResp.status === 404) {
      const indexReq = new Request(new URL('/index.html', url.origin), request);
      const indexResp = await env.ASSETS.fetch(indexReq);
      // El browser reciente index.html pero conservando la URL original
      // en la barra — Angular Router hace el resto client-side.
      return new Response(indexResp.body, {
        status: 200,
        headers: indexResp.headers,
      });
    }

    return assetResp;
  },
};
