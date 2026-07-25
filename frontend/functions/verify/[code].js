// ============================================================
// Cloudflare Pages Function: proxy transparente a Render
// ============================================================
// Ruta: /verify/:code
// Se ejecuta en el edge de Cloudflare, hace fetch al backend y devuelve
// la respuesta al cliente sin cambiar el dominio en la barra del
// navegador (mismo comportamiento que teniamos con el rewrite de Vercel).
//
// Antes intentamos hacerlo con `_redirects` proxy 200, pero Cloudflare
// solo permite proxy 200 hacia paths internos del mismo proyecto.
// Para proxy a un origen externo la forma nativa son Pages Functions.
// ============================================================

const BACKEND_URL = 'https://rifas-nehd.onrender.com';

export const onRequest = async ({ params, request }) => {
  const upstream = `${BACKEND_URL}/v/${encodeURIComponent(params.code)}`;

  // Reenviamos el request preservando metodo y headers relevantes.
  // Filtramos hop-by-hop headers que fetch() reemplaza por su cuenta.
  const proxied = await fetch(upstream, {
    method: request.method,
    headers: request.headers,
    redirect: 'follow',
  });

  // Devolvemos la respuesta tal cual — el navegador la renderiza como
  // si viniera del dominio de Pages.
  return new Response(proxied.body, {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: proxied.headers,
  });
};
