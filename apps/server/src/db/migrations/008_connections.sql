-- Migration 008: connections config (tv secret, telegram, webhook meta)

-- tv_webhook_secret: generated once, used to verify TV alerts
-- Uses hex(randomblob(12)) = 24-char random hex string
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('tv_webhook_secret',     lower(hex(randomblob(12))),  unixepoch() * 1000),
  ('telegram_token',        '',                          unixepoch() * 1000),
  ('telegram_chat_id',      '',                          unixepoch() * 1000),
  ('telegram_topic_daily',  '0',                         unixepoch() * 1000),
  ('telegram_topic_weekly', '0',                         unixepoch() * 1000),
  ('telegram_topic_high',   '0',                         unixepoch() * 1000),
  ('telegram_topic_news',   '0',                         unixepoch() * 1000),
  ('server_url',            '',                          unixepoch() * 1000);
