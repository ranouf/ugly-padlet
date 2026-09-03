const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".pdf", "application/pdf"],
]);

function send(
  response,
  status,
  body,
  contentType = "text/plain; charset=utf-8",
) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(
    new URL(url, `http://127.0.0.1:${port}`).pathname,
  );
  const relative =
    pathname === "/" ? "ugly-padlet-test.html" : pathname.slice(1);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root)) return "";
  if (fs.existsSync(target) && fs.statSync(target).isDirectory())
    return path.join(target, "index.html");
  return target;
}

http
  .createServer((request, response) => {
    const filePath = resolveRequestPath(request.url || "/");
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      send(response, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    send(
      response,
      200,
      fs.readFileSync(filePath),
      mimeTypes.get(ext) || "application/octet-stream",
    );
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`UglyPadlet test server running at http://127.0.0.1:${port}/`);
  });
