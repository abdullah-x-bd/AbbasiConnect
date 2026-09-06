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

type InternalResult = {
  ok: boolean;
  status: number;
  data: any;
};

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

function internalJson(path: string, authorization: string | undefined) {
  return new Promise<InternalResult>((resolve) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: internalPort,
        path,
        method: "GET",
        headers: authorization ? { authorization } : {},
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          try {
            resolve({ ok: status >= 200 && status < 300, status, data: body ? JSON.parse(body) : {} });
          } catch {
            resolve({ ok: false, status, data: {} });
          }
        });
      },
    );
    request.on("error", () => resolve({ ok: false, status: 503, data: {} }));
    request.end();
  });
}

async function memberSession(authorization: string | undefined) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const result = await internalJson("/auth/session", authorization);
  if (!result.ok || result.data?.mode !== "member" || !result.data?.user?.id) return null;
  return result.data;
}

async function openEventStream(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (request.method !== "GET" || !await memberSession(request.headers.authorization)) {
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

async function openPerformanceBootstrap(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { ...corsHeaders(), "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const authorization = request.headers.authorization;
  const session = await memberSession(authorization);
  if (!session) {
    response.writeHead(401, { ...corsHeaders(), "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Member sign-in required" }));
    return;
  }

  const userId = session.user.id;
  const paths = {
    communityFeed: "/community/feed",
    messageThreads: "/messages-secure/threads",
    family: "/family/me",
    rishteMine: "/rishte/me",
    rishteProfiles: "/rishte",
    rishteInterests: "/rishte/interests",
    familyTree: `/family/tree/${userId}`,
  } as const;

  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await internalJson(path, authorization)] as const),
  );

  const payload: Record<string, any> = { userId, session };
  for (const [key, result] of entries) {
    if (result.ok) payload[key] = result.data;
  }

  response.writeHead(200, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
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
  if (path === "/performance/bootstrap") {
    void openPerformanceBootstrap(request, response);
    return;
  }
  proxy(request, response);
});

gateway.keepAliveTimeout = 75_000;
gateway.headersTimeout = 80_000;

gateway.listen(publicPort, "0.0.0.0", () => {
  console.log(`AbbasiConnect realtime gateway listening on ${publicPort}`);
});
