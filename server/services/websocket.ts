import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { WSMessage } from "../../client/src/lib/types";

const clients = new Map<string, WebSocket>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, ws);
    send(ws, { type: "hello", clientId });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WSMessage;
        if (msg.type === "subscribe" && msg.clientId) {
          // Re-bind: client may reconnect with stored id
          clients.set(msg.clientId, ws);
        }
      } catch {
        /* ignore */
      }
    });

    ws.on("close", () => {
      for (const [id, sock] of Array.from(clients.entries())) {
        if (sock === ws) clients.delete(id);
      }
    });
  });
}

export function getClient(clientId: string): WebSocket | undefined {
  return clients.get(clientId);
}

export function send(ws: WebSocket | undefined, msg: WSMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export function sendToClient(clientId: string, msg: WSMessage) {
  send(clients.get(clientId), msg);
}
