// ============================================================
// Cloudflare Worker entry point — declarado como `main` en
// wrangler.jsonc. Se ejecuta antes de servir assets: cada request
// pasa primero por este handler.
//
// Reglas:
//   1) GET /verify/:code   -> proxy al backend Render preservando el
//      302 Location. El browser sigue el redirect a /r/:id?b=:code
//      dentro del mismo dominio, donde Angular Router carga
//      raffle-promo con auto-verify.
//
//   2) Cualquier otra ruta -> se delega a env.ASSETS.fetch().
//      El SPA fallback lo maneja `not_found_handling:
//      "single-page-application"` de wrangler.jsonc — sirve
//      index.html cuando no hay archivo estatico que matchee.
// ============================================================

const BACKEND_URL = 'https://rifas-nehd.onrender.com';
const VERIFY_RE = /^\/verify\/([^/?#]+)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    return env.ASSETS.fetch(request);
  },
};
