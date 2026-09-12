#!/usr/bin/env node
/**
 * Emulator → Herd bridge.
 *
 * Android OkHttp sets Host from the URL and ignores a JS Host header, so a
 * request to http://10.0.2.2/v1 arrives at Herd as Host: 10.0.2.2 and misses
 * the pos-inventory-laravel.test vhost. This proxy listens on the host, rewrites
 * Host, and forwards to Herd on 127.0.0.1:80.
 *
 *   node scripts/herd-emulator-proxy.mjs
 *   # EXPO_PUBLIC_API_URL=http://10.0.2.2:8088/v1
 */
import http from "node:http";

const LISTEN_PORT = Number(process.env.HERD_PROXY_PORT ?? 8088);
const SITE = process.env.HERD_PROXY_SITE ?? "pos-inventory-laravel.test";
const UPSTREAM_HOST = process.env.HERD_PROXY_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.HERD_PROXY_UPSTREAM_PORT ?? 80);

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: SITE };
  // Upstream is HTTP/1.1 on loopback — drop hop-by-hop leftovers.
  delete headers["transfer-encoding"];

  const upstream = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`herd-emulator-proxy: upstream error — ${err.message}`);
  });

  req.pipe(upstream);
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(
    `herd-emulator-proxy listening on 127.0.0.1:${LISTEN_PORT} → Host: ${SITE} @ ${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
  console.log(`EXPO_PUBLIC_API_URL=http://10.0.2.2:${LISTEN_PORT}/v1`);
});
