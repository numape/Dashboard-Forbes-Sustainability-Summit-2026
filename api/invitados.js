// /api/invitados.js  ·  Proxy de Vercel entre el dashboard y Google Apps Script
//
// Variables de entorno (Vercel > Settings > Environment Variables):
//   GOOGLE_SCRIPT_URL  (obligatoria)  URL de la implementación web de Apps Script (termina en /exec, SIN ?key=)
//   API_KEY            (obligatoria si tu Apps Script exige clave)
//
// Diagnóstico: abre  /api/invitados?debug=1  y mira "causa" y "diagnostico". No expone claves ni datos.

const TIMEOUT_MS = 8000;
const CACHE = 's-maxage=3, stale-while-revalidate=6';     // ~1 consulta a Google cada 3 s, sin importar cuántas pantallas haya

let ultimaBuena = null;                                   // respaldo en memoria si Google falla un momento

// Quita espacios, saltos de línea y comillas que se cuelan al pegar en Vercel
const limpiar = v => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();

const URL_VALIDA = /^https:\/\/script\.google\.com\/(macros\/s|a\/macros\/[^/]+\/s)\/[\w-]+\/exec(\?.*)?$/;

export default async function handler(req, res) {
  const debug = !!(req.query && req.query.debug === '1');
  const BASE = limpiar(process.env.GOOGLE_SCRIPT_URL);
  const KEY = limpiar(process.env.API_KEY);

  const diag = {
    tieneUrl: !!BASE,
    urlEsExecDeGoogle: URL_VALIDA.test(BASE),
    urlEsTemporal: /googleusercontent\.com/.test(BASE),   // la que aparece en la barra tras abrir el script: NO sirve
    urlEsDev: /\/dev(\?|$)/.test(BASE),
    urlYaTraeKey: /[?&]key=/.test(BASE),
    tieneApiKey: !!KEY
  };

  const fallar = (causa, extra = {}) => {
    console.error('[invitados]', causa, JSON.stringify({ ...diag, ...extra }));
    res.setHeader('Cache-Control', 'no-store');           // los errores nunca se cachean
    if (ultimaBuena && !debug) {                          // mejor datos de hace unos segundos que una pantalla vacía
      res.setHeader('X-Data-Stale', '1');
      return res.status(200).json(ultimaBuena);
    }
    const cuerpo = { error: 'Error al conectar con la base de datos' };
    if (debug) { cuerpo.causa = causa; cuerpo.diagnostico = { ...diag, ...extra }; }
    return res.status(502).json(cuerpo);
  };

  if (!BASE) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Falta la variable GOOGLE_SCRIPT_URL' });
  }
  if (diag.urlEsTemporal) return fallar('url_temporal');   // copiaste la URL de la barra del navegador, no la de "Administrar implementaciones"

  const url = (KEY && !diag.urlYaTraeKey)
    ? `${BASE}${BASE.includes('?') ? '&' : '?'}key=${encodeURIComponent(KEY)}`
    : BASE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const texto = await response.text();
    const info = {
      estadoGoogle: response.status,
      tipoRespuesta: (response.headers.get('content-type') || '').split(';')[0]
    };

    if (!response.ok) return fallar('http_' + response.status, info);

    let data;
    try {
      data = JSON.parse(texto);
    } catch {
      const pareceLogin = /accounts\.google\.com|ServiceLogin|identifier|Sign in|Iniciar sesi/i.test(texto);
      return fallar(pareceLogin ? 'sin_acceso_publico' : 'respuesta_no_json', info);
    }

    if (data && !Array.isArray(data) && typeof data.error === 'string') {
      return fallar(data.error === 'unauthorized' ? 'clave_rechazada' : 'error_del_script', { ...info, errorDelScript: data.error });
    }

    const lista = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : null);
    if (!lista) return fallar('formato_inesperado', info);

    ultimaBuena = lista;
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(lista);
  } catch (error) {
    return fallar(error.name === 'AbortError' ? 'tiempo_agotado' : 'error_de_red', { mensaje: String(error.message).slice(0, 120) });
  } finally {
    clearTimeout(timer);
  }
}
