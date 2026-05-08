/**
 * Playwright script to capture screenshots of all pages
 * 
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 * 
 * Run:
 *   E2E_BASE_URL=https://hospital-erp-production-d9e3.up.railway.app npx playwright test e2e/screenshots.spec.ts
 * 
 * Screenshots will be saved to: packages/frontend/public/docs/
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const DOCS_DIR = path.resolve(__dirname, '../packages/frontend/public/docs');
const CREDENTIALS = { username: 'admin', password: 'Admin1234' };

// Shared token — login once, reuse across all tests
let authToken: string | null = null;
let authUser: any = null;

async function getToken(): Promise<{ token: string; user: any }> {
  if (authToken && authUser) return { token: authToken, user: authUser };

  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDENTIALS),
  });
  const data = await response.json();

  if (!data.token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  authToken = data.token;
  authUser = data.user;
  return { token: data.token, user: data.user };
}

// Inject auth into page localStorage and navigate
async function loginAndGo(page: Page, path: string) {
  const { token, user } = await getToken();

  await page.goto(BASE_URL);
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...user, must_change_password: false }));
  }, { token, user });

  await page.goto(`${BASE_URL}${path}`);
  await page.waitForTimeout(2000);
}

// Take screenshot
async function screenshot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DOCS_DIR, `${name}.png`), fullPage: false });
}

// Pages that don't require auth
test.describe.serial('Screenshots - Public', () => {
  test('Landing page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);
    await screenshot(page, 'landing');
  });

  test('Login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(1000);
    await screenshot(page, 'login');
  });
});

// Pages that require auth — serial to reuse token
test.describe.serial('Screenshots - Authenticated', () => {
  test('Dashboard', async ({ page }) => {
    await loginAndGo(page, '/app');
    await screenshot(page, 'dashboard');
  });

  test('Patients list', async ({ page }) => {
    await loginAndGo(page, '/app/patients');
    await screenshot(page, 'patients-list');
  });

  test('Consultations', async ({ page }) => {
    await loginAndGo(page, '/app/consultations');
    await screenshot(page, 'consultations');
  });

  test('Laboratoire', async ({ page }) => {
    await loginAndGo(page, '/app/laboratoire');
    await screenshot(page, 'laboratoire');
  });

  test('Finances', async ({ page }) => {
    await loginAndGo(page, '/app/finances');
    await screenshot(page, 'finances');
  });

  test('Facturation', async ({ page }) => {
    await loginAndGo(page, '/app/facturation');
    await screenshot(page, 'facturation');
  });

  test('Pharmacie', async ({ page }) => {
    await loginAndGo(page, '/app/pharmacie');
    await screenshot(page, 'pharmacie');
  });

  test('Rendez-vous', async ({ page }) => {
    await loginAndGo(page, '/app/rendezvous');
    await screenshot(page, 'rdv');
  });

  test('File attente', async ({ page }) => {
    await loginAndGo(page, '/app/file-attente');
    await screenshot(page, 'file-attente');
  });

  test('Lits', async ({ page }) => {
    await loginAndGo(page, '/app/lits');
    await screenshot(page, 'lits');
  });

  test('Rapports', async ({ page }) => {
    await loginAndGo(page, '/app/rapports');
    await screenshot(page, 'rapports');
  });

  test('Utilisateurs', async ({ page }) => {
    await loginAndGo(page, '/app/utilisateurs');
    await screenshot(page, 'utilisateurs');
  });

  test('Habilitations', async ({ page }) => {
    await loginAndGo(page, '/app/habilitations');
    await screenshot(page, 'habilitations');
  });

  test('Documentation', async ({ page }) => {
    await loginAndGo(page, '/app/documentation');
    await screenshot(page, 'documentation');
  });

  test('Concepts', async ({ page }) => {
    await loginAndGo(page, '/app/concepts');
    await screenshot(page, 'concepts');
  });

  test('Content Packages', async ({ page }) => {
    await loginAndGo(page, '/app/content-packages');
    await screenshot(page, 'content-packages');
  });

  test('Paiement Mobile', async ({ page }) => {
    await loginAndGo(page, '/app/paiement-mobile');
    await screenshot(page, 'paiement-mobile');
  });

  test('Portail patient', async ({ page }) => {
    await page.goto(`${BASE_URL}/portail`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'portail');
  });
});
