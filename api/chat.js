export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin === 'https://avatar-parlante.vercel.app' || origin.endsWith('.vercel.app') || origin === 'https://castle9482-cpu.github.io') res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Mensajes inválidos' });
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'DIAGNÓSTICO: GEMINI_API_KEY no está disponible en esta función de Vercel.' });
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
    // Gemini 2.5 Flash is unavailable to new users. Use the current production Flash model instead.
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'Eres un genio mágico de lámpara simpático, carismático y cercano. Habla siempre en español y responde de forma breve y natural.' }] },
        contents,
        generationConfig: { maxOutputTokens: 400 }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: `DIAGNÓSTICO GEMINI: ${data?.error?.message || `HTTP ${response.status}`}` });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'DIAGNÓSTICO GEMINI: la respuesta no contiene texto.' });
    return res.status(200).json({ text });
  } catch (error) {
    console.error('CHAT ERROR', error);
    return res.status(500).json({ error: `DIAGNÓSTICO SERVIDOR: ${error?.message || 'error desconocido'}` });
  }
}
