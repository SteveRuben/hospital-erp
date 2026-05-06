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
const CREDENTIALS = { username: 'admin', password: 'admin123' };

// Helper: login and get token
async function login(page: any) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="text"]', CREDENTIALS.username);
  await page.fill('input[type="password"]', CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app**', { timeout: 10000 });
  await page.waitForTimeout(1000); // Wait for data to load
}

// Helper: take screenshot
async function screenshot(page: any, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DOCS_DIR, `${name}.png`), fullPage: false });
}

test.describe('Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Landing page', async ({ page }) => {
    // Logout first to see landing
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await screenshot(page, 'landing');
  });

  test('Login page', async ({ page }) => {
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(500);
    await screenshot(page, 'login');
  });

  test('Dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/app`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'dashboard');
  });

  test('Patients list', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/patients`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'patients-list');
  });

  test('Consultations', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/consultations`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'consultations');
  });

  test('Laboratoire', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/laboratoire`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'laboratoire');
  });

  test('Finances', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/finances`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'finances');
  });

  test('Facturation', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/facturation`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'facturation');
  });

  test('Pharmacie', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/pharmacie`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'pharmacie');
  });

  test('Rendez-vous', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/rendezvous`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'rdv');
  });

  test('File attente', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/file-attente`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'file-attente');
  });

  test('Lits', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/lits`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'lits');
  });

  test('Rapports', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/rapports`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'rapports');
  });

  test('Utilisateurs', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/utilisateurs`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'utilisateurs');
  });

  test('Habilitations', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/habilitations`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'habilitations');
  });

  test('Documentation', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/documentation`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'documentation');
  });

  test('Concepts', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/concepts`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'concepts');
  });

  test('Content Packages', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/content-packages`);
    await page.waitForTimeout(1500);
    await screenshot(page, 'content-packages');
  });

  test('Portail patient', async ({ page }) => {
    await page.goto(`${BASE_URL}/portail`);
    await page.waitForTimeout(1000);
    await screenshot(page, 'portail');
  });
});