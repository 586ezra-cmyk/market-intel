'use client'

import { useEffect } from 'react'
import { API_BASE } from '@/lib/api'
import { useEyesFlow, cvdDirection } from './eyesFlow'

// ─── הגשר בין העיניים לרמזור ───
// רץ בכל לשונית של האתר. כשהעיניים דלוקות: קורא את ה-CVD מהעוזר המקומי, מחשב את הכיוון (5 דקות),
// ושולח לשרת כל 5 שניות מילה אחת בלבד: up / down / flat. המספרים של Bookmap לא יוצאים מהמחשב.
// השרת משתמש בכיוון הזה כתנאי ה-CVD של הרמזור (וגם בהודעת הטלגרם וביומן), כל עוד הוא טרי (20 שניות).
const EYES = 'http://127.0.0.1:8770/state'
interface EyesState { running?: boolean; window?: string | null; fast?: { cvd?: number | null; ts?: number; age_s?: number } | null; cvd_hist?: Array<[number, number]> }

export default function EyesFlowBridge() {
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let own: Array<[number, number]> = []          // היסטוריה שנצברת כאן, למקרה שהעוזר בגרסה ישנה ולא שולח cvd_hist
    let lastTs = 0
    let lastPost = 0
    const off = () => useEyesFlow.setState({ running: false, symbol: null, cvd: null, ref: null, refAgeS: null, dir: null, ageS: null, sent: false })

    const tick = async () => {
      let delay = 2000
      try {
        const r = await fetch(EYES, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
        const s = await r.json() as EyesState
        if (!alive) return
        if (!s.running) { off(); own = []; delay = 5000 }
        else {
          const nowS = Date.now() / 1000
          const f = s.fast
          if (f && typeof f.cvd === 'number' && f.ts && f.ts !== lastTs) { lastTs = f.ts; own.push([f.ts, f.cvd]); own = own.filter(h => nowS - h[0] <= 420) }
          const hist = s.cvd_hist && s.cvd_hist.length >= own.length ? s.cvd_hist : own
          const d = cvdDirection(hist, nowS)
          const symbol = /NQ/i.test(s.window ?? '') ? 'NQ' : null
          let sent = useEyesFlow.getState().sent
          if (symbol && d.dir && Date.now() - lastPost >= 5000) {
            lastPost = Date.now()
            sent = await fetch(`${API_BASE}/api/live/${symbol}/flow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cvd: d.dir }) })
              .then(x => x.ok).catch(() => false)
          }
          if (!d.dir) sent = false
          if (alive) useEyesFlow.setState({ running: true, symbol, cvd: d.cvd, ref: d.ref, refAgeS: d.refAgeS, dir: d.dir, ageS: f?.age_s != null ? Math.round(f.age_s) : null, sent })
        }
      } catch {
        if (alive) off()
        own = []
        delay = 10_000                               // העוזר סגור: בודקים שוב רק כל 10 שניות
      }
      if (alive) timer = setTimeout(tick, delay)
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  return null
}
