// /api/invitados.js  ·  Proxy de Vercel entre el dashboard y Google Apps Script
//
// Variables de entorno (Vercel > Settings > Environment Variables):
//   GOOGLE_SCRIPT_URL  (obligatoria)  URL de la implementación web de Apps Script (termina en /exec)
//   API_KEY            (opcional)     solo si tu Apps Script exige ?key=...

const TIMEOUT_MS = 8000;                                  // si Google no responde en 8 s, se corta
const CACHE = 's-maxage=3, stale-while-revalidate=6';     // 1 consulta a Google cada ~3 s, sin importar cuántas pantallas haya

let ultimaBuena = null;                                   // respaldo en memoria si Google falla un momento

export default async function handler(req, res) {
  const { GOOGLE_SCRIPT_URL, API_KEY } = process.env;

  if (!GOOGLE_SCRIPT_URL) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Falta la variable GOOGLE_SCRIPT_URL' });
  }

  const url = API_KEY
    ? `${GOOGLE_SCRIPT_URL}${GOOGLE_SCRIPT_URL.includes('?') ? '&' : '?'}key=${encodeURIComponent(API_KEY)}`
    : GOOGLE_SCRIPT_URL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Apps Script respondió HTTP ${response.status}`);

    const texto = await response.text();
    let data;
    try {
      data = JSON.parse(texto);
    } catch {
      throw new Error('Apps Script no devolvió JSON (revisa que la implementación sea "Cualquier usuario")');
    }

    const lista = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : null);
    if (!lista) throw new Error((data && data.error) || 'Formato inesperado');

    ultimaBuena = lista;
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(lista);
  } catch (error) {
    console.error('[invitados]', error.message);
    res.setHeader('Cache-Control', 'no-store');          // los errores nunca se cachean
    if (ultimaBuena) {                                   // mejor datos de hace unos segundos que una pantalla vacía
      res.setHeader('X-Data-Stale', '1');
      return res.status(200).json(ultimaBuena);
    }
    return res.status(502).json({ error: 'Error al conectar con la base de datos' });
  } finally {
    clearTimeout(timer);
  }
}
