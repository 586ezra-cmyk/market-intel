import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Server } from 'http'
import type { WSMessage } from '@market/shared'

let wss: WebSocketServer | null = null

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log(`[WS] Client connected: ${req.socket.remoteAddress}`)

    ws.on('close', () => {
      console.log('[WS] Client disconnected')
    })

    ws.on('error', err => {
      console.error('[WS] Error:', err)
    })

    // Send a welcome ping
    safeSend(ws, { type: 'ping', payload: { time: Date.now() } })
  })

  console.log('[WS] WebSocket server ready')
}

export function broadcastWS(message: WSMessage): void {
  if (!wss) return
  const data = JSON.stringify(message)
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

function safeSend(ws: WebSocket, message: object): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  } catch {
    // ignore
  }
}
