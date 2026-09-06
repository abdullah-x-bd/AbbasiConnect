import http, { type IncomingMessage, type ServerResponse } from "node:http";

const publicPort = Number(process.env.PORT ?? 3001);
const internalPort = publicPort + 1;
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// Start the existing Fastify API on an internal port. The public Render port is
// owned by this small gateway so it can keep an authenticated event stream open
// while proxying every normal API request unchanged.
process.env.PORT = String(internalPort);
await import("./server-v2.js");
process.env.PORT = String(publicPort);

const liveClients = new Set<ServerResponse>();

function corsHeaders() {
  return {
    "access-control-allow-origin": webOrigin,
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    vary: "Origin",
  };
}

function eventDomain(method: string | undefined, url: string | undefined) {
  const verb = (method ?? "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(verb)) return null;
  const path = (url ?? "").split("?")[0];
  if (path.startsWith("/messages-secure/") || path === "/crypto/me") return "messages";
  if (path.startsWith("/community/")) return "community";
  if (path.startsWith("/family/")) return "family";
  if (path.startsWith("/rishte/")) return "rishte";
  if (path === "/auth/me" || path.startsWith("/identity/")) return "profile";
  return null;
}

function broadcast(type: string) {
  const frame = `data: ${JSON.stringify({ type, at: Date.now() })}\n\n`;
  for (const client of [...liveClients]) {
    if (client.destroyed || client.writableEnded) {
      liveClients.delete(client);
      continue;
    }
    try {
      client.write(frame);
    } catch {
      liveClients.delete(client);
    }
  }
}

function verifyMember(authorization: string | undefined) {
  return new Promise<boolean>((resolve) => {
    if (!authorization?.startsWith("Bearer ")) return resolve(false);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: internalPort,
        path: "/auth/session",
        method: "GET",
        headers: { authorization },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return resolve(false);
          try {
            resolve(JSON.parse(body)?.mode === "member");
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.on("error", () => resolve(false));
    request.end();
  });
}

async function openEventStream(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (request.method !== "GET" || !await verifyMember(request.headers.authorization)) {
    response.writeHead(401, { ...corsHeaders(), "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Member sign-in required" }));
    return;
  }

  response.writeHead(200, {
    ...corsHeaders(),
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(`data: ${JSON.stringify({ type: "ready", at: Date.now() })}\n\n`);
  liveClients.add(response);

  const heartbeat = setInterval(() => {
    if (response.destroyed || response.writableEnded) return;
    response.write(`: keepalive ${Date.now()}\n\n`);
  }, 20_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    liveClients.delete(response);
  };
  request.on("close", cleanup);
  response.on("close", cleanup);
}

function proxy(request: IncomingMessage, response: ServerResponse) {
  const domain = eventDomain(request.method, request.url);
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: internalPort,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (upstreamResponse) => {
      const headers = { ...upstreamResponse.headers };
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      upstreamResponse.pipe(response);
      upstreamResponse.on("end", () => {
        const status = upstreamResponse.statusCode ?? 500;
        if (domain && status >= 200 && status < 400) broadcast(domain);
      });
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "API temporarily unavailable" }));
  });
  request.pipe(upstream);
}

const gateway = http.createServer((request, response) => {
  const path = (request.url ?? "").split("?")[0];
  if (path === "/realtime/events") {
    void openEventStream(request, response);
    return;
  }
  proxy(request, response);
});

gateway.keepAliveTimeout = 75_000;
gateway.headersTimeout = 80_000;

gateway.listen(publicPort, "0.0.0.0", () => {
  console.log(`AbbasiConnect realtime gateway listening on ${publicPort}`);
});
