const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  user_number INTEGER UNIQUE,
  fullname TEXT NOT NULL,
  email TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  group_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  request_number INTEGER UNIQUE,
  user_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_group TEXT NOT NULL,
  birthdate TEXT NOT NULL,
  course TEXT NOT NULL,
  admission_date TEXT NOT NULL,
  type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL CHECK(status IN ('new','processing','ready')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ready_email_sent_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','sent','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  last_attempt_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(request_id) REFERENCES requests(id)
);
`);

module.exports = db;
