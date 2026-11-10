import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 4173);
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".mp4", "video/mp4"],
  [".wav", "audio/wav"],
]);

function sendError(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let filePath = path.resolve(root, `.${requestPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
    sendError(response, 403, "Forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendError(response, 404, "Not found");
    return;
  }

  const size = fs.statSync(filePath).size;
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    "Content-Type": mime.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
  };
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : null;
    const start = suffixLength === null ? Number(match[1] || 0) : Math.max(size - suffixLength, 0);
    const end = suffixLength === null && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, "Content-Length": size });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Horovod preview: http://127.0.0.1:${port}/horovod/\n`);
});
