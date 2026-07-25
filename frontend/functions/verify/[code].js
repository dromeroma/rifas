// ============================================================
// Cloudflare Pages Function: /verify/:code
// ============================================================
// Reemplaza el rewrite que teniamos en vercel.json:
//   { source: "/verify/:code", destination: "https://rifas-nehd.onrender.com/v/:code" }
//
// El backend `/v/{code}` responde 302 con Location relativo a la pagina
// premium de la rifa correcta:
//     Location: /r/{raffle_id}?b={code}
//
// Ese redirect DEBE llegar al navegador (no ser seguido por el fetch)
// para que el browser navegue a /r/... dentro del dominio de Pages y
// Angular Router cargue el component raffle-promo.
//
// - redirect: 'manual' evita que fetch siga el 302.
// - Si el upstream devolvio otra cosa (404, error), la respuesta se
//   pasa tal cual al cliente.
// ============================================================

const BACKEND_URL = 'https://rifas-nehd.onrender.com';

export const onRequest = async ({ params, request }) => {
  const upstream = `${BACKEND_URL}/v/${encodeURIComponent(params.code)}`;

  const proxied = await fetch(upstream, {
    method: request.method,
    headers: request.headers,
    redirect: 'manual',
  });

  // Devolvemos la respuesta tal cual — el 302 llega al navegador con su
  // header Location y el browser navega a /r/{id}?b={code} en el mismo
  // dominio de Pages, donde Angular Router toma el control.
  return new Response(proxied.body, {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: proxied.headers,
  });
};
