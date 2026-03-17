const https = require('https');

function callGemini(model, body) {
  return new Promise((resolve, reject) => {
    const key = process.env.GEMINI_API_KEY;
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`);
    const postData = JSON.stringify(body);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch { resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Timeout')));
    req.write(postData);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada en variables de entorno de Vercel.' });
  }

  try {
    const { prompt, imageBase64, mimeType, model } = req.body;

    if (!prompt || !imageBase64) {
      return res.status(400).json({ error: 'Faltan prompt o imageBase64' });
    }

    const geminiModel = model || 'gemini-2.5-flash-image';

    const geminiBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };

    const result = await callGemini(geminiModel, geminiBody);

    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.data?.error?.message || 'Error de la API de Gemini',
      });
    }

    const parts = result.data?.candidates?.[0]?.content?.parts || [];
    let imageData = null, textResponse = '';

    for (const part of parts) {
      if (part.inlineData) imageData = { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' };
      if (part.text) textResponse += part.text;
    }

    if (!imageData) {
      return res.status(500).json({ error: 'Gemini no devolvió imagen. Intenta con otra foto.', text: textResponse });
    }

    return res.status(200).json({
      image: `data:${imageData.mimeType};base64,${imageData.base64}`,
      text: textResponse,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
