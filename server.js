const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

// Load .env
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
} catch (e) {}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const generateHandler = require('./api/generate');
const statusHandler = require('./api/status');

const server = http.createServer(async (req, res) => {
  // API routes
  if (req.url === '/api/generate' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      req.body = JSON.parse(Buffer.concat(chunks).toString());
      const fakeRes = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(data) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this.headers }); res.end(JSON.stringify(data)); },
        end() { res.writeHead(this.statusCode, this.headers); res.end(); },
      };
      generateHandler(req, fakeRes);
    });
    return;
  }

  if (req.url === '/api/status') {
    const fakeRes = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this.headers }); res.end(JSON.stringify(data)); },
    };
    statusHandler(req, fakeRes);
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
