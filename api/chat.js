export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Mensajes inválidos' });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        input: messages,
        instructions: 'Eres un avatar parlante amable, natural y divertido. Responde siempre en español, de forma breve y conversacional.',
        max_output_tokens: 300
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Error de OpenAI' });
    const text = data.output_text || data.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
