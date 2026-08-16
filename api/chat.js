export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Mensajes inválidos' });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.X_GOOG_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel' });

    const tavilyKey = process.env.TAVILY_API_KEY;
    const latest = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    let webContext = '';

    // Para preguntas que puedan necesitar información actual, consultamos Tavily.
    const needsWeb = /\b(hoy|actual|actualmente|últim[oa]s?|noticia|noticias|precio|precios|tiempo|clima|resultado|resultados|partido|fútbol|futbol|quién|quien|qué ha pasado|que ha pasado|buscar|internet|web|2026|2027)\b/i.test(latest);
    if (tavilyKey && needsWeb) {
      try {
        const tr = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query: latest, search_depth: 'basic', max_results: 5, include_answer: true })
        });
        if (tr.ok) {
          const td = await tr.json();
          webContext = `\n\nINFORMACIÓN WEB RECIENTE (úsala como contexto, no inventes datos):\n${td.answer ? td.answer + '\n' : ''}${(td.results || []).map((r, i) => `[${i + 1}] ${r.title}: ${r.content}`).join('\n')}`;
        }
      } catch (_) {}
    }

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));
    if (webContext) contents.push({ role: 'user', parts: [{ text: webContext }] });

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'Eres un genio mágico de lámpara simpático, carismático, divertido y cercano. Habla siempre en español. Responde de forma natural y relativamente breve, como si estuvieras hablando con la persona. Si recibes información web, úsala para responder con datos actuales y no inventes fuentes.' }] },
        contents,
        generationConfig: { temperature: 0.85, maxOutputTokens: 400 }
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Error de Gemini' });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    if (!text) return res.status(502).json({ error: 'La IA no devolvió texto' });
    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
