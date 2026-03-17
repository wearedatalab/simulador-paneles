module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const configured = !!process.env.GEMINI_API_KEY;
  return res.status(200).json({
    apiConfigured: configured,
    message: configured ? 'API key configurada' : 'API key no configurada',
  });
};
