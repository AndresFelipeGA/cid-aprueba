/**
 * Real-browser smoke test for the CID Aprueba frontend.
 *
 * Boots the server against a throw-away SQLite DB, drives the UI with
 * playwright-core (Edge by default, Chrome as fallback) and fails on any
 * uncaught page error, console.error, or missing expected element.
 *
 * Run with: npm run test:e2e
 * Env: E2E_BROWSER_CHANNEL=msedge|chrome (default msedge)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4123;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'cid2024';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const TIMEOUT = 15000;

const problems = [];
let step = 'setup';

const log = (msg) => console.log(`  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  throw new Error(`[${step}] ${message}`);
}

async function waitForServer(child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) fail(`server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch (_err) {
      // not up yet
    }
    await sleep(200);
  }
  fail('server did not become healthy in time');
}

async function launchBrowser() {
  const preferred = process.env.E2E_BROWSER_CHANNEL || 'msedge';
  try {
    return await chromium.launch({ channel: preferred, headless: true });
  } catch (err) {
    if (preferred === 'chrome') throw err;
    console.warn(`  Could not launch channel "${preferred}" (${err.message.split('\n')[0]}); falling back to "chrome"`);
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

async function expectVisible(page, selector, what = selector) {
  const el = page.locator(selector).first();
  try {
    await el.waitFor({ state: 'visible', timeout: TIMEOUT });
  } catch (_err) {
    fail(`expected ${what} (${selector}) to be visible`);
  }
  return el;
}

/** For elements that are in the DOM but never "visible" (e.g. <option>). */
async function expectAttached(page, selector, what = selector) {
  try {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout: TIMEOUT });
  } catch (_err) {
    fail(`expected ${what} (${selector}) to be present`);
  }
}

async function expectHash(page, matcher) {
  try {
    await page.waitForFunction(
      ([m, isRegex]) => (isRegex ? new RegExp(m).test(location.hash) : location.hash === m),
      [matcher instanceof RegExp ? matcher.source : matcher, matcher instanceof RegExp],
      { timeout: TIMEOUT },
    );
  } catch (_err) {
    fail(`expected hash to match ${matcher}, got ${await page.evaluate(() => location.hash)}`);
  }
}

async function login(page, username) {
  step = `login ${username}`;
  await expectVisible(page, '#login-view', 'login view');
  await page.fill('#login-username', username);
  await page.fill('#login-password', PASSWORD);
  await page.click('#login-btn');
  await expectVisible(page, '#app-view', 'app shell');
  await expectVisible(page, '#user-name', 'header user name');
  log(`logged in as ${username}`);
}

async function logout(page) {
  step = 'logout';
  await page.click('#btn-logout');
  await expectVisible(page, '#login-view', 'login view after logout');
  log('logged out');
}

async function dismissEmailModalIfOpen(page) {
  const modal = page.locator('#email-modal');
  if (await modal.isVisible()) {
    await page.click('#email-modal-skip');
    await modal.waitFor({ state: 'hidden', timeout: TIMEOUT });
    log('dismissed email registration modal');
  }
}

/** Full reload onto a hash (token lives in localStorage) and settle the shell. */
async function openHash(page, hash) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, '#app-view', 'app shell after reload');
  await expectVisible(page, '#user-name', 'header user name after reload');
  await expectHash(page, hash);
  await dismissEmailModalIfOpen(page);
}

/** Poll until the first element matching `selector` has the expected text (views re-render asynchronously). */
async function expectText(page, selector, matcher, what = selector) {
  const isRegex = matcher instanceof RegExp;
  try {
    await page.waitForFunction(
      ([sel, m, re]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const text = (el.textContent || '').trim();
        return re ? new RegExp(m).test(text) : text === m;
      },
      [selector, isRegex ? matcher.source : matcher, isRegex],
      { timeout: TIMEOUT },
    );
  } catch (_err) {
    const current = await page.locator(selector).first().textContent({ timeout: 1000 }).catch(() => null);
    fail(`expected ${what} (${selector}) text to match ${matcher}, got ${current === null ? 'no element' : `"${current.trim()}"`}`);
  }
  return ((await page.locator(selector).first().textContent()) || '').trim();
}

// --- API helpers (seed data the UI cannot reach in a single session) ---

async function apiLogin(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok || !json.data || !json.data.token) fail(`API login failed for ${username}: ${json.message || res.status}`);
  return json.data.token;
}

async function api(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  const json = await res.json();
  if (!res.ok) fail(`API ${method} ${path} failed (${res.status}): ${json.message || JSON.stringify(json)}`);
  return json;
}

const pdfForm = (fields, filename) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), filename);
  return form;
};

/** Create a second requisition and drive it through all 7 steps to 'approved'. */
async function seedApprovedRequisition() {
  step = 'seed approved requisition (API)';
  const coord = await apiLogin('coord.territorio');
  const created = await api(coord, 'POST', '/requisitions', pdfForm({
    title: `E2E Aprobada ${Date.now()}`,
    description: 'Sembrada por la prueba de humo para el acta',
  }, 'acta.pdf'));
  const req = created.data.requisition;
  if (req.current_approval_level !== 2 || req.status !== 'in_review') {
    fail(`new requisition should start at step 2 in_review, got step ${req.current_approval_level} ${req.status}`);
  }

  const approve = async (username, comments) => {
    const token = await apiLogin(username);
    return api(token, 'POST', `/approvals/${req.id}/approve`, { comments });
  };

  await approve('dir.programatica', 'Aprobación programática (e2e)');
  await approve('rep.legal', 'Aprobación legal (e2e)');

  const compras = await apiLogin('enc.compras');
  const quotation = await api(compras, 'POST', `/requisitions/${req.id}/quotations`, pdfForm({
    provider_name: 'Proveedor E2E S.A.S.',
    amount: 1250000,
    notes: 'Entrega en 15 días',
  }, 'cotizacion.pdf'));
  const qId = quotation.data.quotation.id;
  for (const docType of ['rut', 'camara_comercio', 'cedula', 'certificado_bancario']) {
    await api(compras, 'POST', `/requisitions/${req.id}/quotations/${qId}/documents`, pdfForm({ doc_type: docType }, `${docType}.pdf`));
  }
  await api(compras, 'POST', `/approvals/${req.id}/approve`, { comments: 'Cotizaciones completas (e2e)' });

  await approve('rep.legal', 'Cotización única seleccionada (e2e)');
  await approve('area.financiera', 'Aprobación financiera (e2e)');
  const final = await approve('area.compras', 'Aprobación final (e2e)');

  const approved = final.data.requisition;
  if (approved.status !== 'approved') fail(`seeded requisition should be approved, got ${approved.status}`);
  log(`seeded ${approved.number} through all 7 steps to "approved"`);
  return approved;
}

async function run(page) {
  // --- Coordinator flow ---
  step = 'open app';
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await login(page, 'coord.territorio');
  await expectHash(page, '#/dashboard');
  await dismissEmailModalIfOpen(page);

  step = 'dashboard';
  await expectVisible(page, '.stats .stat-card', 'dashboard stat cards');
  await expectVisible(page, '.dashboard-charts .chart-card', 'dashboard charts');
  log('dashboard rendered');

  step = 'requisitions';
  await page.click('.sidebar__link[data-view="requisitions"]');
  await expectHash(page, '#/requisitions');
  await expectVisible(page, '#req-search', 'requisitions search box');
  await expectAttached(page, '#req-filter-level option[value="7"]', 'step filter populated from /api/meta');
  await expectAttached(page, '#req-filter-status option[value="returned"]', 'status filter built from meta.status_labels');
  await expectVisible(page, '#btn-export-requisitions', 'Exportar CSV button');
  await expectVisible(page, '#req-table-container', 'requisitions table container');
  log('requisitions list rendered');

  step = 'create requisition';
  await page.click('#nav-create-requisition');
  await expectHash(page, '#/create');
  await expectVisible(page, '#upload-form', 'create form');
  const reqTitle = `E2E Requisición ${Date.now()}`;
  await page.fill('#upload-title', reqTitle);
  await page.fill('#upload-description', 'Creada por la prueba de humo');
  await page.setInputFiles('#upload-file', { name: 'e2e.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expectVisible(page, '#file-name', 'selected file name');
  await page.click('#upload-btn');
  await expectVisible(page, '.toast--success', 'success toast');
  log('requisition created (success toast shown)');

  step = 'requisition detail';
  await expectHash(page, /^#\/requisitions\/\d+$/);
  const detailHash = await page.evaluate(() => location.hash);
  await expectVisible(page, '.req-detail__title', 'requisition detail title');
  const shownTitle = (await page.locator('.req-detail__title').textContent()).trim();
  if (shownTitle !== reqTitle) fail(`detail title mismatch: "${shownTitle}" !== "${reqTitle}"`);
  const reqNumber = await expectText(page, '.req-detail__number', /^REQ-\d{4}-\d{4}$/, 'requisition number');
  await expectText(page, '.req-detail__heading .badge', 'En revisión', 'status badge (creation lands at step 2)');
  await expectVisible(page, '.timeline__item--current', 'current timeline step');
  if ((await page.locator('#approval-panel').count()) !== 0) fail('coordinator must not see an approval panel at step 2');
  log(`detail rendered at ${detailHash} as ${reqNumber}`);

  step = 'profile';
  await page.click('.sidebar__link[data-view="profile"]');
  await expectHash(page, '#/profile');
  await expectVisible(page, '#profile-form', 'profile form');
  await expectAttached(page, '#profile-gender option[value="F"]', 'gender options');
  log('profile rendered');

  step = 'browser back';
  await page.goBack();
  await expectHash(page, detailHash);
  await expectVisible(page, '.req-detail__title', 'detail title after back');
  log(`back navigation restored ${detailHash}`);

  step = 'aria-busy cleared';
  const busy = await page.getAttribute('#main-content', 'aria-busy');
  if (busy) fail('#main-content still aria-busy after render');

  await logout(page);

  // --- Legal representative flow ---
  await login(page, 'rep.legal');
  await expectHash(page, '#/dashboard'); // logout must drop the previous user's deep link
  await dismissEmailModalIfOpen(page);
  await expectVisible(page, '#btn-export-approvals', 'Exportar historial button for role 3');

  step = 'users';
  await expectVisible(page, '#nav-users', 'users nav link for role 3');
  await page.goto(`${BASE}/#/users`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, '#app-view', 'app shell after reload');
  await expectHash(page, '#/users');
  await expectVisible(page, '#user-table-container .table', 'users table');
  await expectAttached(page, '#user-filter-role option[value="6"]', 'role filter populated from /api/meta');
  const rowCount = await page.locator('#user-table-container tbody tr').count();
  if (rowCount < 6) fail(`expected at least 6 seeded users, got ${rowCount}`);
  log(`users table rendered with ${rowCount} rows`);

  step = 'confirm dialog';
  await page.click('#user-table-container [data-action="toggle-user-active"]');
  await expectVisible(page, '#confirm-dialog[open]', 'confirmation dialog');
  await page.keyboard.press('Escape');
  await page.locator('#confirm-dialog[open]').waitFor({ state: 'hidden', timeout: TIMEOUT });
  log('confirm dialog opens and closes with Escape');

  await logout(page);

  // --- Director/a Programática returns the requisition to the start ---
  await login(page, 'dir.programatica');
  await dismissEmailModalIfOpen(page);
  await openHash(page, detailHash);

  step = 'return to start';
  await expectVisible(page, '#approval-panel', 'approval panel for step 2 owner');
  if ((await page.locator('input[name="approval-action"][value="return_previous"]').count()) !== 0) {
    fail('"Devolver al paso anterior" must be hidden at step 2');
  }
  await page.check('input[name="approval-action"][value="return_start"]');
  await expectText(page, '#btn-approval-submit', 'Devolver al inicio', 'submit button label follows the option');
  if (!(await page.locator('#btn-approval-submit').getAttribute('class')).includes('btn--warning')) {
    fail('return option should use the warning button colour');
  }
  await page.click('#btn-approval-submit'); // no comments yet → inline validation
  await expectVisible(page, '#approval-comments-error', 'inline "comments required" error');
  if ((await page.locator('#confirm-dialog[open]').count()) !== 0) fail('confirm dialog must not open without comments');
  await page.fill('#approval-comments', 'Falta el anexo presupuestal, por favor radicar nueva versión.');
  await page.click('#btn-approval-submit');
  await expectVisible(page, '#confirm-dialog[open]', 'return confirmation dialog');
  await page.click('#confirm-dialog-accept');
  await expectText(page, '.req-detail__heading .badge', 'Devuelta', 'status badge after return');
  await expectVisible(page, '.returned-banner', 'returned banner');
  await expectVisible(page, '.activity-item--returned', 'returned entry in history');
  log('requisition returned to start (badge "Devuelta")');

  await logout(page);

  // --- Coordinator resubmits a new version ---
  await login(page, 'coord.territorio');
  await dismissEmailModalIfOpen(page);
  await openHash(page, detailHash);

  step = 'resubmit new version';
  await expectVisible(page, '#resubmit-panel', 'resubmit panel for the coordinator');
  const prefilled = await page.inputValue('#resubmit-title');
  if (prefilled !== reqTitle) fail(`resubmit title should be prefilled, got "${prefilled}"`);
  await page.setInputFiles('#resubmit-file', { name: 'e2e-v2.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expectText(page, '#resubmit-file-name', 'e2e-v2.pdf', 'selected new file name');
  await page.fill('#resubmit-comments', 'Se agrega el anexo presupuestal.');
  await page.click('#btn-resubmit');
  await expectVisible(page, '.toast--success', 'resubmit success toast');
  await expectText(page, '.req-detail__heading .version-badge', 'v2', 'v2 badge');
  await expectText(page, '.req-detail__heading .badge', 'En revisión', 'status back to "En revisión"');
  await expectVisible(page, '#versions-panel', 'versions section');
  if ((await page.locator('#versions-panel .version-item').count()) < 2) fail('expected two document versions');
  log('new version radicada (v2, "En revisión")');

  // --- Fully approved requisition (seeded through the API) → acta + amounts ---
  const approved = await seedApprovedRequisition();

  step = 'acta';
  await openHash(page, `#/requisitions/${approved.id}/acta`);
  await expectText(page, '.acta__title', 'Acta de aprobación', 'acta title');
  await expectText(page, '.acta__number', approved.number, 'acta number');
  await expectVisible(page, '.acta__table', 'acta steps table');
  const signatureCount = await page.locator('.acta__signature').count();
  if (signatureCount < 5) fail(`expected at least 5 distinct signers, got ${signatureCount}`);
  await expectVisible(page, '.acta__row--selected', 'selected quotation highlighted in the acta');
  await expectVisible(page, '#btn-print-acta', 'print button');
  log(`acta rendered for ${approved.number} with ${signatureCount} signatures`);

  step = 'approved detail';
  await openHash(page, `#/requisitions/${approved.id}`);
  await expectText(page, '.req-detail__heading .badge', 'Aprobada', 'approved status badge');
  await expectVisible(page, '#btn-generate-acta', '"Generar acta" button');
  const amountText = await expectText(page, '.quotation-card__amount', /\$\s?\d/, 'formatted quotation amount');
  if (!amountText.includes('$') || !/\d/.test(amountText)) fail(`amount should be formatted as currency, got "${amountText}"`);
  await page.click('#btn-generate-acta');
  await expectHash(page, `#/requisitions/${approved.id}/acta`);
  await expectVisible(page, '.acta', 'acta via "Generar acta" button');
  log(`approved detail shows amount "${amountText}" and links to the acta`);
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-e2e-'));
  let server = null;
  let browser = null;
  let page = null;
  let exitCode = 0;

  try {
    step = 'start server';
    server = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        JWT_SECRET: 'e2e',
        LOG_LEVEL: 'error',
        DB_PATH: path.join(tmp, 'e2e.sqlite'),
        UPLOAD_DIR: path.join(tmp, 'uploads'),
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    server.stderr.on('data', (chunk) => process.stderr.write(`  [server] ${chunk}`));
    await waitForServer(server);
    log(`server up on ${BASE}`);

    step = 'launch browser';
    browser = await launchBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT);

    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });

    await run(page);

    if (problems.length > 0) {
      console.error('\nBrowser reported errors:');
      for (const p of problems) console.error(`  - ${p}`);
      exitCode = 1;
    } else {
      console.log('\nE2E smoke test passed: no page errors, no console errors, all views rendered.');
    }
  } catch (err) {
    console.error(`\nE2E smoke test FAILED: ${err.message}`);
    if (page && process.env.E2E_SCREENSHOT) {
      await page.screenshot({ path: process.env.E2E_SCREENSHOT, fullPage: true }).catch(() => {});
      console.error(`Screenshot saved to ${process.env.E2E_SCREENSHOT}`);
    }
    if (problems.length > 0) {
      console.error('Browser reported errors:');
      for (const p of problems) console.error(`  - ${p}`);
    }
    exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([new Promise((r) => server.once('exit', r)), sleep(3000)]);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main();
