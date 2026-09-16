import { Router, Request, Response } from 'express'
import { parseBody, idParam, NoteBody } from '../middleware/validate'
import { getDb } from '../db/client'

const router = Router()

// GET /api/notes
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb()
    const notes = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
    res.json(notes)
  } catch (err: any) {
    { console.error('[Error]', err?.message ?? err); res.status(500).json({ error: 'Internal error' }) }
  }
})

// POST /api/notes
router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb()
    const body = parseBody(NoteBody, req, res); if (!body) return
    const { id, content } = body
    const now = Date.now()
    db.prepare(`
      INSERT INTO notes (id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(id, content ?? '', now, now)
    res.json({ ok: true, id })
  } catch (err: any) {
    { console.error('[Error]', err?.message ?? err); res.status(500).json({ error: 'Internal error' }) }
  }
})

// DELETE /api/notes/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb()
    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params['id'])
    res.json({ ok: true })
  } catch (err: any) {
    { console.error('[Error]', err?.message ?? err); res.status(500).json({ error: 'Internal error' }) }
  }
})

export default router
