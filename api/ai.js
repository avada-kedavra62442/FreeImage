export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST to request an AI image edit.' }); }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI editing is not configured. Add OPENAI_API_KEY to Vercel Environment Variables, then redeploy.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const prompt = String(body?.prompt || '').trim();
    const imageData = String(body?.image || '');
    if (!prompt) return res.status(400).json({ error: 'Enter a description for the image edit.' });
    const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'A valid PNG, JPEG, or WebP image is required.' });
    const mime = match[1], bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'The AI preview is too large. Try a smaller image.' });
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt.slice(0, 4000));
    form.append('size', 'auto');
    form.append('quality', 'medium');
    form.append('image', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'source.png' : mime === 'image/webp' ? 'source.webp' : 'source.jpg');
    const upstream = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({ error: result?.error?.message || 'The AI provider rejected the edit request.' });
    const generated = result?.data?.[0]?.b64_json;
    if (!generated) return res.status(502).json({ error: 'The AI provider returned no edited image.' });
    return res.status(200).json({ image: 'data:image/png;base64,' + generated });
  } catch (error) { return res.status(500).json({ error: error?.message || 'AI image editing failed unexpectedly.' }); }
}
