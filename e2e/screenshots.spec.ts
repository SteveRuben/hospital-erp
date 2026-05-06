/**
 * Playwright script to capture screenshots of all pages
 * 
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 * 
 * Run:
 *   npx playwright test e2e/screenshots.spec.ts
 * 
 * Screenshots will be saved to: packages/frontend/public/docs/
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const DOCS_DIR = path.resolve(__dirname, '../packages/frontend/public/docs');
const CREDENTIALS = { username: 'admin', password: 'Admin1234' };

// Helper: login and get token via API, then set localStorage
async function login(page: any) {
  // First get token via API
  const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: CREDENTIALS.username, password: CREDENTIALS.password },
  });
  const data = await response.json();
  
  if (!data.token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  // Navigate to app and inject auth into localStorage
  await page.goto(BASE_URL);
  await page.evaluate(({ token, user }: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...user, must_change_password: false }));
  }, { token: data.token, user: data.user });
  
  // Now navigate to app
  await page.goto(`${BASE_URL}/app`);
  await page.waitForTimeout(2000);
}

// Helper: take screenshot
async function screenshot(page: any, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DOCS_DIR, `${name}.png`), fullPage: false });
}

test.describe('Screenshots', () => {
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

  test('Dashboard', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'dashboard');
  });

  test('Patients list', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/patients`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'patients-list');
  });

  test('Consultations', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/consultations`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'consultations');
  });

  test('Laboratoire', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/laboratoire`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'laboratoire');
  });

  test('Finances', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/finances`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'finances');
  });

  test('Facturation', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/facturation`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'facturation');
  });

  test('Pharmacie', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/pharmacie`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'pharmacie');
  });

  test('Rendez-vous', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/rendezvous`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'rdv');
  });

  test('File attente', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/file-attente`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'file-attente');
  });

  test('Lits', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/lits`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'lits');
  });

  test('Rapports', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/rapports`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'rapports');
  });

  test('Utilisateurs', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/utilisateurs`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'utilisateurs');
  });

  test('Habilitations', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/habilitations`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'habilitations');
  });

  test('Documentation', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/documentation`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'documentation');
  });

  test('Concepts', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/concepts`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'concepts');
  });

  test('Content Packages', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/app/content-packages`);
    await page.waitForTimeout(2000);
    await screenshot(page, 'content-packages');
  });

  test('Portail patient', async ({ page }) => {
    await page.goto(`${BASE_URL}/portail`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'portail');
  });
});