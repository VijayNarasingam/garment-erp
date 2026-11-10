#!/usr/bin/env node
/**
 * Post-deploy API smoke test for Garment ERP.
 *
 * Usage:
 *   node scripts/smoke.mjs
 *   BASE_URL=http://localhost:8090 SMOKE_PASSWORD=Retail@123 node scripts/smoke.mjs
 *   SMOKE_FRONTEND_URL=http://localhost:8088 node scripts/smoke.mjs
 *
 * Requires Node.js 20+ (global fetch). Exits non-zero on the first failure.
 */

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const frontendUrl = (process.env.SMOKE_FRONTEND_URL ?? '').replace(/\/+$/, '');
const username = process.env.SMOKE_USERNAME ?? 'owner';
const password = process.env.SMOKE_PASSWORD ?? 'Retail@123';
const branchId = process.env.SMOKE_BRANCH_ID ?? '';

let passed = 0;
const failures = [];

function ok(name, detail = '') {
  passed += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`  FAIL  ${name} — ${detail}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function check(name, condition, detail) {
  if (condition) ok(name, detail);
  else fail(name, detail);
}

async function main() {
  console.log(`Smoke testing ${baseUrl}\n`);

  // 1. Health
  try {
    const health = await request('/actuator/health');
    check('health endpoint', health.status === 200 && health.body?.status === 'UP',
      `status=${health.status} value=${health.body?.status}`);

    const readiness = await request('/actuator/health/readiness');
    check('readiness probe', readiness.status === 200 && readiness.body?.status === 'UP',
      `status=${readiness.status} value=${readiness.body?.status}`);
  } catch (error) {
    fail('health endpoint', error.message);
    console.error('\nBackend reachable illa — smoke test stop pannren.');
    process.exit(1);
  }

  // 2. Unauthenticated API must be rejected
  const anonymous = await request('/api/dashboard');
  check('unauthenticated request rejected', anonymous.status === 401 || anonymous.status === 403,
    `status=${anonymous.status}`);

  // 3. Login
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (login.status !== 200 || !login.body?.token) {
    fail('login', `status=${login.status} body=${JSON.stringify(login.body)}`);
    console.error('\nLogin fail aayiduchu — remaining checks skip pannren.');
    process.exit(1);
  }
  const token = login.body.token;
  ok('login', `user=${login.body.user?.username} business=${login.body.business?.name}`);
  check('login returns permissions', Array.isArray(login.body.user?.permissions) && login.body.user.permissions.length > 0,
    `${login.body.user?.permissions?.length ?? 0} permissions`);

  const auth = { Authorization: `Bearer ${token}` };
  const branchQuery = branchId ? `branchId=${encodeURIComponent(branchId)}` : '';

  // 4. Dashboard
  const dashboard = await request(`/api/dashboard${branchQuery ? `?${branchQuery}` : ''}`, { headers: auth });
  check('dashboard', dashboard.status === 200 && dashboard.body?.todaySales !== undefined,
    `status=${dashboard.status} todaySales=${dashboard.body?.todaySales}`);

  // 5. Returns list (paginated)
  const returns = await request(
    `/api/returns?page=0&size=5${branchQuery ? `&${branchQuery}` : ''}`, { headers: auth });
  check('returns list', returns.status === 200 && Array.isArray(returns.body?.content),
    `status=${returns.status} total=${returns.body?.totalElements}`);

  // 6. Returns summary
  const summary = await request(`/api/returns/summary${branchQuery ? `?${branchQuery}` : ''}`, { headers: auth });
  check('returns summary', summary.status === 200 && typeof summary.body?.total === 'number',
    `status=${summary.status} total=${summary.body?.total} pending=${summary.body?.pending}`);

  // 7. Sales invoices
  const sales = await request(
    `/api/sales/invoices?page=0&size=5${branchQuery ? `&${branchQuery}` : ''}`, { headers: auth });
  check('sales invoices', sales.status === 200 && Array.isArray(sales.body?.content),
    `status=${sales.status} total=${sales.body?.totalElements}`);

  // 8. Optional frontend check
  if (frontendUrl) {
    try {
      const response = await fetch(`${frontendUrl}/`, { signal: AbortSignal.timeout(20_000) });
      const html = await response.text();
      check('frontend served', response.status === 200 && html.includes('<div id="root">'),
        `status=${response.status} url=${frontendUrl}`);
    } catch (error) {
      fail('frontend served', `${frontendUrl}: ${error.message}`);
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`Smoke test FAILED — ${passed} passed, ${failures.length} failed.`);
    for (const failure of failures) console.error(`  - ${failure.name}: ${failure.detail}`);
    process.exit(1);
  }
  console.log(`Smoke test PASSED — ${passed} checks.`);
}

main().catch((error) => {
  console.error(`Smoke test crashed: ${error.stack ?? error.message}`);
  process.exit(1);
});
