import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';

const root = resolve(process.cwd());
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5500);

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveRequestPath(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, cleanPath === '/' ? 'index.html' : cleanPath);
  return filePath.startsWith(root) ? filePath : join(root, 'index.html');
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || '/');
  const pathToServe = existsSync(filePath) && statSync(filePath).isDirectory()
    ? join(filePath, 'index.html')
    : filePath;

  if (!existsSync(pathToServe)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentTypes[extname(pathToServe)] || 'application/octet-stream',
  });
  createReadStream(pathToServe).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Pipes frontend running at http://${host}:${port}`);
});
