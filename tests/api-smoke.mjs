/**
 * Smoke test for the new IncidenciasTRANS features.
 *
 * Runs a disposable server instance (fresh SQLite DB in a temp cwd) and
 * exercises the API through real HTTP calls. No test framework needed.
 *
 * Usage (on the server, where Node 24 is installed):
 *   node tests/api-smoke.mjs
 *
 * Optional:
 *   SERVER_ENTRY=/opt/incidencias-trans/dist/server.js node tests/api-smoke.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const entry = process.env.SERVER_ENTRY || '/opt/incidencias-trans/dist/server.js';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incidencias-smoke-'));
const port = 3101 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, [entry], {
  cwd: tmpDir,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLogs = '';
server.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

function expectStatus(res, expected, label) {
  assert.equal(
    res.status,
    expected,
    `${label}: expected HTTP ${expected}, got ${res.status}. Body: ${res.text || '<empty>'}`
  );
}

async function api(endpoint, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Session-Token'] = token;

  const res = await fetch(`${base}/api${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, text, headers: res.headers };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not start on ${base}\n${serverLogs}`);
}

async function shutdown() {
  if (!server.killed) {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (!server.killed) server.kill('SIGKILL');
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const unique = `smoke_${Date.now().toString(36)}`;
const unique2 = `${unique}_b`;
let adminToken = '';
let adminId = 0;
let userToken = '';
let userToken2 = '';
let incidentId = 0;

try {
  await waitForServer();

  await test('health endpoint responds', async () => {
    const res = await api('/health');
    expectStatus(res, 200, 'health');
    assert.equal(res.body.status, 'ok');
  });

  const adminLogin = await api('/auth/admin-login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' },
  });
  adminToken = adminLogin.body?.token || '';
  adminId = adminLogin.body?.user?.id || 0;

  await test('default admin is a superadmin and gets a session token', async () => {
    expectStatus(adminLogin, 200, 'admin login');
    assert.equal(adminLogin.body.user.role, 'superadmin');
    assert.ok(adminLogin.body.token, 'admin login must return a session token');
  });

  await test('user management requires a valid session token', async () => {
    const res = await api('/users');
    expectStatus(res, 401, 'GET /users without token');
  });

  await test('superadmin can list users with a token', async () => {
    const res = await api('/users', { token: adminToken });
    expectStatus(res, 200, 'GET /users with token');
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some((u) => u.username === 'admin'));
  });

  const userLogin = await api('/auth/user-login', {
    method: 'POST',
    body: { username: unique, fullName: 'Smoke Test', department: 'QA' },
  });
  userToken = userLogin.body?.token || '';

  await test('first user login auto-creates an active standard user', async () => {
    expectStatus(userLogin, 200, 'auto user login');
    assert.equal(userLogin.body.user.role, 'user');
    assert.equal(userLogin.body.user.username, unique);
    assert.ok(userLogin.body.token, 'user login must return a session token');
  });

  await test('auto-created user is visible to the superadmin with form data', async () => {
    const res = await api('/users', { token: adminToken });
    expectStatus(res, 200, 'GET /users');
    const created = res.body.find((u) => u.username === unique);
    assert.ok(created, `user ${unique} must exist`);
    assert.equal(created.full_name, 'Smoke Test');
    assert.equal(created.department, 'QA');
    assert.equal(created.is_active, 1);
  });

  await test('admin accounts cannot log in through the passwordless user tab', async () => {
    const res = await api('/auth/user-login', {
      method: 'POST',
      body: { username: 'admin' },
    });
    expectStatus(res, 403, 'user login as admin');
  });

  await test('user login rejects invalid usernames', async () => {
    const res = await api('/auth/user-login', {
      method: 'POST',
      body: { username: 'bad name!' },
    });
    expectStatus(res, 400, 'user login invalid username');
  });

  await test('login creates a session with client ip', async () => {
    const res = await api('/sessions', { token: adminToken });
    expectStatus(res, 200, 'GET /sessions');
    assert.ok(Array.isArray(res.body));
    const session = res.body.find((s) => s.username === 'admin');
    assert.ok(session, 'admin session must exist');
    assert.ok(session.ip, 'session must store the client ip');
  });

  const mac = 'aa:bb:cc:dd:ee:ff';
  const hostname = 'SMOKE-PC';
  const agentRegister = await api('/client-machines', {
    method: 'POST',
    body: {
      hostname,
      ip: '127.0.0.1',
      mac,
      windows_user: 'smokeuser',
      windows_domain: 'TESTDOM',
      os: 'Windows 11',
    },
  });

  await test('agent can register a client machine', async () => {
    expectStatus(agentRegister, 200, 'POST /client-machines');
    assert.equal(agentRegister.body.success, true);
  });

  await test('superadmin can list registered machines', async () => {
    const res = await api('/client-machines', { token: adminToken });
    expectStatus(res, 200, 'GET /client-machines');
    const machine = res.body.find((m) => m.hostname === hostname);
    assert.ok(machine, 'registered machine must be listed');
    assert.equal(machine.mac, mac);
    assert.equal(machine.windows_user, 'smokeuser');
  });

  await test('agent data enriches sessions by ip', async () => {
    const res = await api('/sessions', { token: adminToken });
    expectStatus(res, 200, 'GET /sessions after agent');
    const session = res.body.find((s) => s.windows_user === 'smokeuser');
    assert.ok(session, 'a session must be enriched with the agent data');
    assert.equal(session.hostname, hostname);
    assert.equal(session.mac, mac);
    assert.equal(session.windows_domain, 'TESTDOM');
  });

  const incidentRes = await api('/incidents', {
    method: 'POST',
    token: userToken,
    body: {
      title: 'Smoke incident',
      description: 'Smoke description',
      creator_username: unique,
      category: 'general',
      priority: 'media',
    },
  });
  incidentId = incidentRes.body?.incidentId || 0;

  await test('incident captures the client machine info', async () => {
    expectStatus(incidentRes, 201, 'POST /incidents');
    const res = await api(`/incidents/${incidentId}`, { token: adminToken });
    expectStatus(res, 200, 'GET /incidents/:id');
    const inc = res.body.incident;
    assert.ok(inc.client_ip, 'incident must store client_ip');
    assert.equal(inc.client_mac, mac);
    assert.equal(inc.client_hostname, hostname);
    assert.equal(inc.client_windows_user, 'smokeuser');
    assert.equal(inc.client_windows_domain, 'TESTDOM');
  });

  await test('agent script is downloadable and contains the registration call', async () => {
    const res = await api('/client-agent.ps1');
    expectStatus(res, 200, 'GET /client-agent.ps1');
    assert.match(String(res.body), /Invoke-RestMethod/);
    assert.match(String(res.body), /\/api\/client-machines/);
  });

  await test('only superadmin can wipe incidents (token required)', async () => {
    const noToken = await api('/admin/wipe/incidents', {
      method: 'POST',
      body: { confirmation: 'BORRAR' },
    });
    expectStatus(noToken, 401, 'wipe incidents without token');
  });

  await test('wipe incidents requires the confirmation text', async () => {
    const res = await api('/admin/wipe/incidents', {
      method: 'POST',
      token: adminToken,
      body: { confirmation: 'NO' },
    });
    expectStatus(res, 400, 'wipe incidents wrong confirmation');
  });

  await test('superadmin can wipe incidents', async () => {
    const res = await api('/admin/wipe/incidents', {
      method: 'POST',
      token: adminToken,
      body: { confirmation: 'BORRAR' },
    });
    expectStatus(res, 200, 'wipe incidents');
    const list = await api('/incidents', { token: adminToken });
    expectStatus(list, 200, 'GET /incidents after wipe');
    assert.equal(list.body.length, 0);
  });

  const user2Login = await api('/auth/user-login', {
    method: 'POST',
    body: { username: unique2, fullName: 'Smoke Test 2', department: 'QA' },
  });
  userToken2 = user2Login.body?.token || '';
  const inc2 = await api('/incidents', {
    method: 'POST',
    token: userToken2,
    body: {
      title: 'Smoke incident 2',
      description: 'Smoke description 2',
      creator_username: unique2,
    },
  });
  assert.equal(inc2.status, 201, `second incident creation: ${inc2.text}`);

  await test('superadmin can wipe users while preserving their own account', async () => {
    const res = await api('/admin/wipe/users', {
      method: 'POST',
      token: adminToken,
      body: { confirmation: 'BORRAR', deleteIncidents: true },
    });
    expectStatus(res, 200, 'wipe users');

    const users = await api('/users', { token: adminToken });
    expectStatus(users, 200, 'GET /users after wipe');
    assert.equal(users.body.length, 1);
    assert.equal(users.body[0].username, 'admin');
    assert.equal(users.body[0].role, 'superadmin');

    const list = await api('/incidents', { token: adminToken });
    expectStatus(list, 200, 'GET /incidents after users wipe');
    assert.equal(list.body.length, 0);
  });

  await test('sessions of deleted users are invalidated', async () => {
    const res = await api('/users', { token: userToken2 });
    expectStatus(res, 401, 'deleted user session');
  });

  await test('the last superadmin cannot be demoted', async () => {
    const res = await api(`/users/${adminId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { role: 'user' },
    });
    assert.ok(
      res.status === 400 || res.status === 403,
      `expected 400/403 when demoting the last superadmin, got ${res.status}. Body: ${res.text}`
    );
    const users = await api('/users', { token: adminToken });
    expectStatus(users, 200, 'GET /users after demote attempt');
    const admin = users.body.find((u) => u.username === 'admin');
    assert.equal(admin.role, 'superadmin');
  });

  await test('the last superadmin cannot be deactivated', async () => {
    const res = await api(`/users/${adminId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { is_active: false },
    });
    assert.ok(
      res.status === 400 || res.status === 403,
      `expected 400/403 when deactivating the last superadmin, got ${res.status}. Body: ${res.text}`
    );
  });

  await test('the last superadmin cannot be deleted', async () => {
    const res = await api(`/users/${adminId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.ok(
      res.status === 400 || res.status === 403,
      `expected 400/403 when deleting the last superadmin, got ${res.status}. Body: ${res.text}`
    );
  });
} finally {
  await shutdown();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('\nFailures:');
  for (const f of failed) console.log(` - ${f.name}: ${f.error?.message || 'failed'}`);
  process.exitCode = 1;
}
