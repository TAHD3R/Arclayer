import http from "node:http";
import { createDevMiddleware, renderPage } from "vike/server";

const PORT = Number.parseInt(process.env.PORT || "3100", 10);
const isProd = process.env.NODE_ENV === "production";

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function start() {
  const root = new URL("../", import.meta.url).pathname;

  const vikeDev = isProd ? null : await createDevMiddleware({ root });

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Bad Request");
        return;
      }

      if (vikeDev) {
        vikeDev.devMiddleware(req, res, async (err) => {
          if (err) throw err;
          await handleVike(req, res);
        });
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
  const pageContextInit = {
    urlOriginal: req.url,
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
