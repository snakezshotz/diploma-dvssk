const fs = require('fs');
const path = require('path');
const request = require('supertest');

const tempDbPath = path.join(__dirname, 'test-data.sqlite');
if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
process.env.DB_PATH = tempDbPath;

const { createApp, db } = require('../server/app');
const app = createApp();

beforeAll(() => {});

afterAll(() => {
  try { db.close(); } catch {}
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
});

describe('API security and business flows', () => {
  it('logs in admin and can view users list', async () => {
    const agent = request.agent(app);

    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });

    expect(login.statusCode).toBe(200);
    expect(login.body.user.role).toBe('admin');

    const users = await agent.get('/api/users');
    expect(users.statusCode).toBe(200);
    expect(Array.isArray(users.body.users)).toBe(true);
    expect(users.body.users.length).toBeGreaterThan(0);
  });

  it('prevents student from admin-only endpoint', async () => {
    const agent = request.agent(app);

    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'student', password: '123' });

    expect(login.statusCode).toBe(200);

    const users = await agent.get('/api/users');
    expect(users.statusCode).toBe(403);
  });

  it('creates request as student and sets ready status as admin', async () => {
    const studentAgent = request.agent(app);
    const adminAgent = request.agent(app);

    await studentAgent.post('/api/auth/login').send({ username: 'student', password: '123' });
    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin' });

    const created = await studentAgent.post('/api/requests').send({
      birthdate: '2001-02-03',
      admissionDate: '2022-09-01',
      course: '3',
      type: 'Справка об обучении',
      purpose: 'Для предоставления работодателю',
      comment: 'Тестовая заявка'
    });

    expect(created.statusCode).toBe(201);
    expect(created.body.request.status).toBe('new');

    const toProcessing = await adminAgent
      .patch(`/api/requests/${created.body.request.id}/status`)
      .send({ status: 'processing' });

    expect(toProcessing.statusCode).toBe(200);
    expect(toProcessing.body.request.status).toBe('processing');

    const toReady = await adminAgent
      .patch(`/api/requests/${created.body.request.id}/status`)
      .send({ status: 'ready' });

    expect(toReady.statusCode).toBe(200);
    expect(toReady.body.request.status).toBe('ready');
    expect(['sent', 'failed', 'skipped']).toContain(toReady.body.email.status);
  });

  it('allows admin to edit student profile', async () => {
    const adminAgent = request.agent(app);

    await adminAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin' });

    const users = await adminAgent.get('/api/users');
    const student = users.body.users.find((u) => u.role === 'student');

    const updated = await adminAgent
      .put(`/api/users/${student.id}`)
      .send({
        fullname: 'Петров Петр Петрович',
        email: 'petrov@example.com',
        username: 'student_2',
        group: '312'
      });

    expect(updated.statusCode).toBe(200);
    expect(updated.body.user.fullname).toBe('Петров Петр Петрович');
    expect(updated.body.user.username).toBe('student_2');
  });
});
