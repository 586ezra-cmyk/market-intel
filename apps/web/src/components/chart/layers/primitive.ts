// מתאם ציור לגרסה 5 של lightweight-charts.
// השכבות הישנות נכתבו כאובייקט עם draw(ctx) בלבד. גרסה 5 מציירת רק דרך paneViews(), ולכן הן נצמדו לגרף ולא צוירו בכלל.
// asPrimitive מוסיף לאותו אובייקט את paneViews, וסופר כמה פריטים כל שכבה מציירת (כדי שהסרגל יראה "דלוק" רק כשיש ציור).
import { useMarketStore } from '@/store/marketStore'

interface OldPrimitive { draw: (ctx: CanvasRenderingContext2D, params?: unknown) => void }
interface Scope { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }

const counts: Record<string, number> = {}
function report(layer: string, delta: number): void {
  counts[layer] = Math.max(0, (counts[layer] ?? 0) + delta)
  useMarketStore.getState().setLayerDrawn(`${layer}:prim`, counts[layer])
}

/** הקוד הישן קורא ctx.canvas.width/height בפיקסלים של מסך רגיל; כאן מחזירים לו את מידות האזור בפועל (גם במסך רטינה). */
function mediaCtx(ctx: CanvasRenderingContext2D, size: { width: number; height: number }): CanvasRenderingContext2D {
  const canvas = { width: size.width, height: size.height }
  return new Proxy(ctx, {
    get(t, p) {
      if (p === 'canvas') return canvas
      const v = (t as unknown as Record<PropertyKey, unknown>)[p]
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
    },
    set(t, p, v) { (t as unknown as Record<PropertyKey, unknown>)[p] = v; return true },
  })
}

export function asPrimitive<T extends OldPrimitive>(old: T, layer: string): T {
  const o = old as T & { paneViews?: () => unknown; updateAllViews?: () => void; attached?: () => void; detached?: () => void }
  if (o.paneViews) return old
  const renderer = {
    draw(target: { useMediaCoordinateSpace: (f: (s: Scope) => void) => void }) {
      target.useMediaCoordinateSpace(scope => { try { old.draw(mediaCtx(scope.context, scope.mediaSize)) } catch { /* ציור שנכשל לא מפיל את הגרף */ } })
    },
  }
  const views = [{ renderer: () => renderer }]
  o.paneViews = () => views
  o.updateAllViews = () => {}
  o.attached = () => report(layer, 1)
  o.detached = () => report(layer, -1)
  return old
}
