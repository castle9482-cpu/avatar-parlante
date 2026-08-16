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

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.X_GOOG_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'DIAGNÓSTICO: GEMINI_API_KEY no está disponible en esta función de Vercel.' });

    // La búsqueda web se hace con Tavily para no consumir la cuota de Google Search Grounding.
    const tavilyKey = process.env.TAVILY_API_KEY;
    const latest = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    let webContext = '';

    const needsWeb = /\b(hoy|actual|actualmente|últim[oa]s?|noticia|noticias|precio|precios|tiempo|clima|resultado|resultados|partido|fútbol|futbol|quién|quien|qué ha pasado|que ha pasado|buscar|internet|web|2026|2027|reciente|último|última)\b/i.test(latest);

    if (tavilyKey && needsWeb) {
      try {
        const tr = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: latest,
            search_depth: 'basic',
            max_results: 5,
            include_answer: true
          })
        });
        if (tr.ok) {
          const td = await tr.json();
          webContext = `\n\nINFORMACIÓN WEB RECIENTE. Úsala para responder con datos actuales y no inventes datos:\n${td.answer ? td.answer + '\n' : ''}${(td.results || []).map((r, i) => `[${i + 1}] ${r.title}: ${r.content}`).join('\n')}`;
        }
      } catch (e) {
        console.error('TAVILY ERROR', e);
      }
    }

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));
    if (webContext) contents.push({ role: 'user', parts: [{ text: webContext }] });

    const systemText = `Eres un genio mágico de lámpara simpático, carismático, cercano y divertido. Habla siempre en español. Da respuestas completas, útiles y naturales, normalmente de 2 a 5 párrafos cuando la pregunta lo necesite. No cortes las respuestas ni las hagas artificialmente breves. Si recibes información web, úsala para responder con datos actuales y no inventes fuentes.`;

    // Gemini 3.6 Flash es el modelo principal actual. Si su cuota está agotada,
    // probamos automáticamente modelos Flash-Lite con cuotas independientes por modelo.
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    let lastError = null;

    for (const model of models) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { maxOutputTokens: 1200 }
        })
      });

      const data = await response.json();
      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
        if (text) return res.status(200).json({ text });
        lastError = 'La IA no devolvió texto.';
      } else {
        lastError = data?.error?.message || `HTTP ${response.status}`;
        console.error(`GEMINI ${model} ERROR`, lastError);
        if (response.status !== 429) break;
      }
    }

    return res.status(502).json({ error: `DIAGNÓSTICO GEMINI: ${lastError || 'No se pudo obtener respuesta.'}` });
  } catch (error) {
    console.error('CHAT ERROR', error);
    return res.status(500).json({ error: `DIAGNÓSTICO SERVIDOR: ${error?.message || 'error desconocido'}` });
  }
}
