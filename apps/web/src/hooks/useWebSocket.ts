'use client'

import { useEffect, useRef } from 'react'
import { useMarketStore } from '@/store/marketStore'
import type { WSMessage } from '@market/shared'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'
const RECONNECT_DELAY = 3000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    pushAlert, pushFVG, markFVGFilled, pushStructure,
    setActiveRange, pushLiquidity, pushSMT, pushWyckoff,
    setWSConnected,
  } = useMarketStore()

  function connect() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Connected')
      setWSConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'alert':     pushAlert(msg.payload); break
          case 'fvg':       pushFVG(msg.payload as any); break
          case 'fvg_filled': markFVGFilled(msg.payload.id, msg.payload.filledAt); break
          case 'structure': pushStructure(msg.payload); break
          case 'range':     setActiveRange(msg.payload); break
          case 'liquidity': pushLiquidity(msg.payload); break
          case 'smt':       pushSMT(msg.payload); break
          case 'wyckoff':   pushWyckoff(msg.payload); break
          case 'ping':      break // keep-alive
        }
      } catch (e) {
        console.warn('[WS] Parse error', e)
      }
    }

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...')
      setWSConnected(false)
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
