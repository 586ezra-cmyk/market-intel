-- Notes table for trader notes with server persistence
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
