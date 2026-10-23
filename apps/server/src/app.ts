import { createServer, type RequestListener, type Server } from "node:http";

// HTTP surface of apps/server. Socket.io attaches to this server in M4-T1.
export const handleRequest: RequestListener = (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
};

export function createAppServer(): Server {
  return createServer(handleRequest);
}
