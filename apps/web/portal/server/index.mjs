import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDevMiddleware, renderPage } from "vike/server";

const PORT = Number.parseInt(process.env.PORT || "3100", 10);
const isProd = process.env.NODE_ENV === "production";
// Keep env naming consistent with Admin:
// - VITE_API_PROXY_TARGET is shared across apps
// - PORTAL_API_PROXY_TARGET is kept as a backwards-compatible fallback
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET || process.env.PORTAL_API_PROXY_TARGET || "";

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function start() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distClientDir = path.join(root, "dist/client");

  const vikeDev = isProd ? null : await createDevMiddleware({ root });

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Bad Request");
        return;
      }

      // Optional: proxy API calls to the FastAPI backend so browser requests remain same-origin.
      // This is intentionally opt-in to avoid surprises in production deployments.
      if (apiProxyTarget && req.url.startsWith("/api/")) {
        await proxyHttpRequest(req, res, apiProxyTarget);
        return;
      }

      if (vikeDev) {
        vikeDev.devMiddleware(req, res, async (err) => {
          if (err) throw err;
          await handleVike(req, res);
        });
        return;
      }

      // Production: serve built static assets from dist/client first.
      // This keeps the production mode locally testable without any additional dependency.
      if (await tryServeStaticAsset(req, res, distClientDir)) {
        return;
      }

      await handleVike(req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(PORT, () => {
    console.log(`Portal SSR server running at http://localhost:${PORT}`);
  });
}

async function handleVike(req, res) {
  // Keep special URLs out of the app shell.
  // Chrome DevTools (and other tools) may request well-known paths; returning the app HTML with 200 is misleading.
  if (req.url && req.url.startsWith("/.well-known/")) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const pageContextInit = {
    urlOriginal: req.url,
    headersOriginal: req.headers,
  };

  const pageContext = await renderPage(pageContextInit);
  const httpResponse = pageContext.httpResponse;
  if (!httpResponse) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const { statusCode, headers, body } = httpResponse;
  res.statusCode = statusCode;
  headers.forEach(([name, value]) => res.setHeader(name, value));
  res.end(body);
}

async function tryServeStaticAsset(req, res, distClientDir) {
  const url = new URL(req.url, "http://localhost");
  const pathname = safeDecodePathname(url.pathname);
  if (!pathname) return false;

  // We intentionally do not serve directory indexes.
  if (pathname === "/" || pathname.endsWith("/")) return false;

  const filePath = path.join(distClientDir, pathname);
  if (!isPathInsideDir(filePath, distClientDir)) {
    res.statusCode = 400;
    res.end("Bad Request");
    return true;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;

    const buf = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", guessContentType(filePath));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

function safeDecodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isPathInsideDir(filePath, dir) {
  const rel = path.relative(dir, filePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function proxyHttpRequest(req, res, targetOrigin) {
  // Minimal proxy to keep local dev flows smooth (Portal SSR + API on different ports).
  // For production deployments, prefer a real reverse proxy (nginx/caddy) instead.
  let target;
  try {
    target = new URL(targetOrigin);
  } catch {
    res.statusCode = 500;
    res.end("Invalid VITE_API_PROXY_TARGET");
    return;
  }

  const isHttps = target.protocol === "https:";
  const lib = isHttps ? https : http;

  const url = new URL(req.url, target);
  const headers = { ...req.headers };
  headers.host = target.host;

  const proxyReq = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      method: req.method,
      path: url.pathname + url.search,
      headers,
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502;
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v !== undefined) res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    res.statusCode = 502;
    res.end("Bad Gateway");
  });

  req.pipe(proxyReq);
}
