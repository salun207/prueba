// Cloudflare Worker — relay para la WhatsApp Cloud API.
//
// Para qué sirve: el navegador puede bloquear la llamada directa a la API
// de Meta por CORS. Este worker hace de intermediario. Además mantiene el
// token fuera del navegador si lo cargás como variable de entorno.
//
// Cómo ponerlo en marcha (dos minutos, gratis):
//   1. Entrá a dash.cloudflare.com → Workers & Pages → Create Worker
//   2. Pegá este archivo completo, reemplazando lo que venga por defecto
//   3. Deploy
//   4. Copiá la URL del worker (https://algo.workers.dev) y pegala en
//      Huntly → Ajustes → Envío automático → URL del relay
//
// Opcional, para no mandar el token desde el navegador: en el worker,
// Settings → Variables, creá WHATSAPP_TOKEN con tu token. El worker lo
// va a usar y podés dejar el campo del token vacío en Huntly.

const GRAPH_VERSION = "v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: { message: "Solo se acepta POST" } }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: "El cuerpo tiene que ser JSON" } }, 400);
    }

    const { phoneId, payload } = body;
    const token = env.WHATSAPP_TOKEN || body.token;
    if (!phoneId || !token) {
      return json({ error: { message: "Faltan phoneId o token" } }, 400);
    }

    const path = new URL(request.url).pathname;

    // Probar la conexión: devuelve los datos del número
    if (path.endsWith("/check")) {
      const r = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return json(await r.text(), r.status);
    }

    // Enviar un mensaje
    if (!payload) return json({ error: { message: "Falta el payload del mensaje" } }, 400);
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return json(await r.text(), r.status);
  },
};
