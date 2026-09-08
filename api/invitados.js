export default async function handler(req, res) {
  // 1. REEMPLAZA ESTO CON LA URL DE TU GOOGLE APPS SCRIPT
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyR95Xm5S8DrcyBzhYmkRMGlW5OqTuLE-mv7vXAC5xEvzsAGN79J8biXxvYfdMd4khy/exec';

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL);
    const data = await response.json();

    // 2. LA MAGIA DE LA CACHÉ
    // Guarda los datos en el servidor de Vercel por 5 segundos.
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    
    // 3. ENVIAMOS LOS DATOS AL HTML
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al conectar con la base de datos' });
  }
}