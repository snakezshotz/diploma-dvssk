const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const db = require('./db');
const { buildReadyEmailTemplate } = require('./templates/readyEmail');

const SESSION_COOKIE = 'session_token';
const SESSION_DAYS = 7;

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function genId() {
  return crypto.randomUUID();
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    userNumber: row.user_number,
    fullname: row.fullname,
    email: row.email,
    username: row.username,
    group: row.group_name,
    role: row.role,
    createdAt: row.created_at
  };
}

function normalizeRequest(row) {
  return {
    id: row.id,
    requestNumber: row.request_number,
    userId: row.user_id,
    studentName: row.student_name,
    studentGroup: row.student_group,
    birthdate: row.birthdate,
    course: row.course,
    admissionDate: row.admission_date,
    type: row.type,
    purpose: row.purpose,
    comment: row.comment || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readyEmailSentAt: row.ready_email_sent_at || null
  };
}

function validateRegistration({ fullname, email, username, password, group }) {
  if (!fullname || fullname.trim().length < 5) return 'Укажите ФИО полностью (минимум 5 символов).';
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return 'Укажите корректный email.';
  if (!/^[\w.-]{3,30}$/u.test(username || '')) return 'Логин должен быть 3-30 символов: буквы, цифры, _, ., -';
  if (!password || password.length < 8) return 'Пароль должен содержать минимум 8 символов.';
  if (!/^[0-9A-Za-zА-Яа-я\-]{1,12}$/u.test(group || '')) return 'Некорректный формат группы.';
  return null;
}

function validateUserProfile({ fullname, email, username, group }) {
  if (!fullname || fullname.trim().length < 5) return 'Укажите ФИО полностью (минимум 5 символов).';
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return 'Укажите корректный email.';
  if (!/^[\w.-]{3,30}$/u.test(username || '')) return 'Логин должен быть 3-30 символов: буквы, цифры, _, ., -';
  if (!/^[0-9A-Za-zА-Яа-я\-]{1,12}$/u.test(group || '')) return 'Некорректный формат группы.';
  return null;
}

function validateRequest(payload) {
  const { birthdate, admissionDate, purpose, comment } = payload;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const birth = new Date(birthdate);
  const admission = new Date(admissionDate);

  if (Number.isNaN(birth.getTime()) || Number.isNaN(admission.getTime())) {
    return 'Проверьте заполнение дат.';
  }

  if (birth > today) return 'Дата рождения не может быть в будущем.';
  if (admission > today) return 'Дата поступления не может быть в будущем.';
  if (admission < birth) return 'Дата поступления не может быть раньше даты рождения.';
  if (!purpose || purpose.trim().length < 3) return 'Поле "Куда предоставляется" должно содержать минимум 3 символа.';
  if (purpose.trim().length > 120) return 'Поле "Куда предоставляется" слишком длинное (макс. 120 символов).';
  if ((comment || '').trim().length > 500) return 'Комментарий слишком длинный (макс. 500 символов).';

  return null;
}

function nextNumber(table, field) {
  const row = db.prepare(`SELECT COALESCE(MAX(${field}), 0) AS max_value FROM ${table}`).get();
  return Number(row.max_value || 0) + 1;
}

function ensureSeedData() {
  const usersCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (usersCount > 0) return;

  const createdAt = nowIso();
  const insertUser = db.prepare(`
    INSERT INTO users (id, user_number, fullname, email, username, password_hash, group_name, role, created_at)
    VALUES (@id, @user_number, @fullname, @email, @username, @password_hash, @group_name, @role, @created_at)
  `);

  const studentId = genId();
  const adminId = genId();

  insertUser.run({
    id: studentId,
    user_number: 1,
    fullname: 'Иванов Иван Иванович',
    email: 'ivanov@dvssk.ru',
    username: 'student',
    password_hash: bcrypt.hashSync('123', 10),
    group_name: '311',
    role: 'student',
    created_at: createdAt
  });

  insertUser.run({
    id: adminId,
    user_number: 2,
    fullname: 'Администратор',
    email: 'admin@dvssk.ru',
    username: 'admin',
    password_hash: bcrypt.hashSync('admin', 10),
    group_name: '',
    role: 'admin',
    created_at: createdAt
  });

  db.prepare(`
    INSERT INTO requests (
      id, request_number, user_id, student_name, student_group, birthdate, course,
      admission_date, type, purpose, comment, status, created_at, updated_at
    ) VALUES (
      @id, @request_number, @user_id, @student_name, @student_group, @birthdate, @course,
      @admission_date, @type, @purpose, @comment, @status, @created_at, @updated_at
    )
  `).run({
    id: genId(),
    request_number: 1,
    user_id: studentId,
    student_name: 'Иванов Иван Иванович',
    student_group: '311',
    birthdate: '2000-01-01',
    course: '3',
    admission_date: '2021-09-01',
    type: 'Справка об обучении',
    purpose: 'По месту требования',
    comment: 'Срочно',
    status: 'new',
    created_at: createdAt,
    updated_at: createdAt
  });
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

async function sendReadyEmail(requestRow) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(requestRow.user_id);
  if (!user?.email) {
    return { status: 'skipped', error: 'У пользователя не указан email.' };
  }

  const template = buildReadyEmailTemplate({
    studentName: user.fullname,
    requestNumber: `#${String(requestRow.request_number).padStart(4, '0')}`,
    requestType: requestRow.type
  });

  const logId = genId();
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO email_logs (id, request_id, to_email, subject, body, status, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 'queued', 0, ?)
  `).run(logId, requestRow.id, user.email, template.subject, template.body, createdAt);

  const transporter = createTransporter();
  if (!transporter) {
    db.prepare(`
      UPDATE email_logs
      SET status = 'failed', attempts = attempts + 1, error_message = ?, last_attempt_at = ?
      WHERE id = ?
    `).run('SMTP не настроен', nowIso(), logId);
    return { status: 'failed', error: 'SMTP не настроен' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: template.subject,
      text: template.body
    });

    const sentAt = nowIso();
    db.prepare(`
      UPDATE email_logs
      SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_attempt_at = ?
      WHERE id = ?
    `).run(sentAt, sentAt, logId);

    db.prepare('UPDATE requests SET ready_email_sent_at = ? WHERE id = ?').run(sentAt, requestRow.id);
    return { status: 'sent' };
  } catch (error) {
    db.prepare(`
      UPDATE email_logs
      SET status = 'failed', attempts = attempts + 1, error_message = ?, last_attempt_at = ?
      WHERE id = ?
    `).run(String(error.message || error), nowIso(), logId);

    return { status: 'failed', error: String(error.message || error) };
  }
}

async function retryFailedEmails(limit = 20) {
  const failed = db.prepare(`
    SELECT * FROM email_logs
    WHERE status = 'failed' AND attempts < 5
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit);

  const transporter = createTransporter();
  if (!transporter) return { retried: 0, sent: 0, failed: failed.length };

  let sent = 0;
  let retried = 0;

  for (const log of failed) {
    retried += 1;
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: log.to_email,
        subject: log.subject,
        text: log.body
      });

      const sentAt = nowIso();
      db.prepare(`
        UPDATE email_logs
        SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_attempt_at = ?, error_message = NULL
        WHERE id = ?
      `).run(sentAt, sentAt, log.id);

      db.prepare('UPDATE requests SET ready_email_sent_at = ? WHERE id = ?').run(sentAt, log.request_id);
      sent += 1;
    } catch (error) {
      db.prepare(`
        UPDATE email_logs
        SET attempts = attempts + 1, error_message = ?, last_attempt_at = ?
        WHERE id = ?
      `).run(String(error.message || error), nowIso(), log.id);
    }
  }

  return { retried, sent, failed: retried - sent };
}

function getSessionUser(token) {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return normalizeUser(session);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = addDaysIso(SESSION_DAYS);

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt, createdAt);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}

function clearSession(res, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(SESSION_COOKIE);
}

function createApp() {
  ensureSeedData();

  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(cookieParser());

  app.use((req, _res, next) => {
    req.currentUser = getSessionUser(req.cookies[SESSION_COOKIE]);
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много попыток входа. Попробуйте позже.' }
  });

  function requireAuth(req, res, next) {
    if (!req.currentUser) return res.status(401).json({ error: 'Требуется авторизация.' });
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.currentUser) return res.status(401).json({ error: 'Требуется авторизация.' });
    if (req.currentUser.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав.' });
    next();
  }

  app.post('/api/auth/register', async (req, res) => {
    const payload = req.body || {};
    const error = validateRegistration(payload);
    if (error) return res.status(400).json({ error });

    const usernameExists = db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)').get(payload.username);
    if (usernameExists) return res.status(409).json({ error: 'Логин уже существует.' });

    const now = nowIso();
    const userId = genId();
    const userNumber = nextNumber('users', 'user_number');
    const passwordHash = await bcrypt.hash(payload.password, 10);

    db.prepare(`
      INSERT INTO users (id, user_number, fullname, email, username, password_hash, group_name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'student', ?)
    `).run(userId, userNumber, payload.fullname.trim(), payload.email.trim(), payload.username.trim(), passwordHash, payload.group.trim(), now);

    createSession(res, userId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json({ user: normalizeUser(user) });
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username = '', password = '' } = req.body || {};

    const user = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username.trim());
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль.' });

    createSession(res, user.id);
    res.json({ user: normalizeUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSession(res, req.cookies[SESSION_COOKIE]);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.currentUser });
  });

  app.get('/api/users', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY user_number ASC').all();
    res.json({ users: rows.map(normalizeUser) });
  });

  app.get('/api/users/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Пользователь не найден.' });
    res.json({ user: normalizeUser(row) });
  });

  app.put('/api/users/:id', requireAdmin, (req, res) => {
    const payload = req.body || {};
    const error = validateUserProfile(payload);
    if (error) return res.status(400).json({ error });

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден.' });

    const duplicate = db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?) AND id <> ?').get(payload.username.trim(), req.params.id);
    if (duplicate) return res.status(409).json({ error: 'Логин уже занят другим пользователем.' });

    db.prepare('UPDATE users SET fullname=?, email=?, username=?, group_name=? WHERE id=?')
      .run(payload.fullname.trim(), payload.email.trim(), payload.username.trim(), payload.group.trim(), req.params.id);

    db.prepare('UPDATE requests SET student_name=?, student_group=? WHERE user_id=?')
      .run(payload.fullname.trim(), payload.group.trim(), req.params.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json({ user: normalizeUser(updated) });
  });

  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден.' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Удалять администраторов нельзя.' });

    db.prepare('DELETE FROM requests WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    res.json({ ok: true });
  });

  app.get('/api/requests', requireAuth, (req, res) => {
    const rows = req.currentUser.role === 'admin'
      ? db.prepare('SELECT * FROM requests ORDER BY request_number DESC').all()
      : db.prepare('SELECT * FROM requests WHERE user_id = ? ORDER BY request_number DESC').all(req.currentUser.id);

    res.json({ requests: rows.map(normalizeRequest) });
  });

  app.get('/api/requests/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Заявка не найдена.' });

    if (req.currentUser.role !== 'admin' && row.user_id !== req.currentUser.id) {
      return res.status(403).json({ error: 'Недостаточно прав.' });
    }

    res.json({ request: normalizeRequest(row) });
  });

  app.post('/api/requests', requireAuth, (req, res) => {
    if (req.currentUser.role !== 'student') {
      return res.status(403).json({ error: 'Создавать заявки может только студент.' });
    }

    const payload = req.body || {};
    const error = validateRequest(payload);
    if (error) return res.status(400).json({ error });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.currentUser.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден.' });

    const id = genId();
    const requestNumber = nextNumber('requests', 'request_number');
    const createdAt = nowIso();

    db.prepare(`
      INSERT INTO requests (
        id, request_number, user_id, student_name, student_group, birthdate, course,
        admission_date, type, purpose, comment, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
    `).run(
      id,
      requestNumber,
      req.currentUser.id,
      user.fullname,
      user.group_name,
      payload.birthdate,
      String(payload.course),
      payload.admissionDate,
      payload.type,
      payload.purpose.trim(),
      (payload.comment || '').trim(),
      createdAt,
      createdAt
    );

    const created = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.status(201).json({ request: normalizeRequest(created) });
  });

  app.patch('/api/requests/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body || {};
    if (!['processing', 'ready'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус.' });
    }

    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Заявка не найдена.' });

    db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), req.params.id);

    const updated = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

    let email = { status: 'skipped' };
    if (row.status !== 'ready' && status === 'ready' && !row.ready_email_sent_at) {
      email = await sendReadyEmail(updated);
    }

    res.json({ request: normalizeRequest(updated), email });
  });

  app.delete('/api/requests/:id', requireAdmin, (req, res) => {
    const exists = db.prepare('SELECT 1 FROM requests WHERE id = ?').get(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Заявка не найдена.' });

    db.prepare('DELETE FROM email_logs WHERE request_id = ?').run(req.params.id);
    db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);

    res.json({ ok: true });
  });

  app.get('/api/email/logs', requireAdmin, (_req, res) => {
    const logs = db.prepare('SELECT * FROM email_logs ORDER BY created_at DESC').all();
    res.json({ logs });
  });

  app.post('/api/email/retry-failed', requireAdmin, async (_req, res) => {
    const result = await retryFailedEmails();
    res.json(result);
  });

  app.use(express.static(path.join(__dirname, '..')));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });

  return app;
}

module.exports = {
  createApp,
  db,
  ensureSeedData,
  retryFailedEmails
};
