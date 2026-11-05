import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api';
let failures = 0;

function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  if (!cond) failures++;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Session-Token'] = token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, body: data };
}

const db = new DatabaseSync('/opt/incidencias-trans/data/incidencias.db');
const users = db.prepare('SELECT username, role, is_active FROM users ORDER BY id').all();
const incidentCount = db.prepare('SELECT COUNT(*) as c FROM incidents').get().c;
db.close();

console.log('DB users:', JSON.stringify(users));
console.log('DB incidents:', incidentCount);
check('admin account is superadmin', users.some((u) => u.username === 'admin' && u.role === 'superadmin'));

const login = await api('/auth/admin-login', {
  method: 'POST',
  body: { username: 'admin', password: 'admin123' },
});
check('admin/admin123 login', login.status === 200 && login.body?.user?.role === 'superadmin', `status=${login.status}`);
const token = login.body?.token;
check('admin login returns token', !!token);
if (!token) process.exit(1);

const list = await api('/users', { token });
check('GET /users with token', list.status === 200 && Array.isArray(list.body), `status=${list.status}`);

const sessions = await api('/sessions', { token });
check('GET /sessions with token', sessions.status === 200 && Array.isArray(sessions.body), `status=${sessions.status}`);
check(
  'admin session captured with IP',
  sessions.status === 200 && sessions.body.some((s) => s.username === 'admin' && s.ip),
  'no session ip'
);

const machines = await api('/client-machines', { token });
check('GET /client-machines with token', machines.status === 200 && Array.isArray(machines.body), `status=${machines.status}`);

const agent = await api('/client-agent.ps1');
check(
  'agent script downloadable',
  agent.status === 200 &&
    String(agent.body).includes('Invoke-RestMethod') &&
    String(agent.body).includes('/api/client-machines')
);

const testUser = `prodcheck_${Date.now()}`;
const auto = await api('/auth/user-login', {
  method: 'POST',
  body: { username: testUser, fullName: 'Verificacion Produccion', department: 'Sistemas' },
});
check('auto-registration on production', auto.status === 200 && auto.body?.user?.username === testUser && !!auto.body?.token, `status=${auto.status}`);

const after = await api('/users', { token });
const created = after.status === 200 ? after.body.find((u) => u.username === testUser) : null;
check(
  'auto-created user visible to superadmin',
  !!created && created.full_name === 'Verificacion Produccion' && created.department === 'Sistemas'
);

if (created) {
  const del = await api(`/users/${created.id}`, { method: 'DELETE', token });
  check('test user deleted', del.status === 200, `status=${del.status}`);
}
const final = await api('/users', { token });
check('test user no longer listed', final.status === 200 && !final.body.some((u) => u.username === testUser));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PRODUCTION CHECKS PASSED');
process.exit(failures ? 1 : 0);
