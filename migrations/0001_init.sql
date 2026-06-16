CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL,
  scale_min REAL NOT NULL DEFAULT 140,
  scale_max REAL NOT NULL DEFAULT 230,
  raw_path TEXT NOT NULL,
  smooth_path TEXT NOT NULL,
  monthly_checkpoints TEXT NOT NULL,
  final_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS market_days (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL NOT NULL,
  close REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS market_fetches (
  symbol TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT
);
