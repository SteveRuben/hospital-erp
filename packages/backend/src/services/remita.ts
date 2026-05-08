/**
 * Remita Payment Service
 * Based on: Remita API Integration Guide v1.0
 * Base URL: https://api.remita.finance (production)
 * Supports: OMCM, MOMOCM, CIWAVE, CIOM, SNWAVE, SNOM, SNFREE, BFOM, MLMOOV, BJMTN, BJMOOV, UGMTN, UGAIRTEL
 */

const REMITA_BASE_URL = process.env.REMITA_API_URL || 'https://api.remita.finance';
const REMITA_API_KEY = process.env.REMITA_API_KEY || '';
const REMITA_API_ID = process.env.REMITA_API_ID || '';
const REMITA_USERNAME = process.env.REMITA_USERNAME || '';
const REMITA_PASSWORD = process.env.REMITA_PASSWORD || '';
const REMITA_WEBHOOK_URL = process.env.REMITA_WEBHOOK_URL || '';

let cachedToken: { access_token: string; refresh_token: string; expires_at: number } | null = null;

// Get or refresh JWT token via POST /public/access_token
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.access_token;
  }

  // If we have a refresh token, try to refresh first
  if (cachedToken?.refresh_token) {
    try {
      const refreshResponse = await fetch(`${REMITA_BASE_URL}/public/refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cachedToken.refresh_token }),
      });
      if (refreshResponse.ok) {
        const data = await refreshResponse.json() as { access_token: string; refresh_token: string; expires_in: number };
        cachedToken = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
        return cachedToken.access_token;
      }
    } catch { /* fall through to full login */ }
  }

  console.log(`[REMITA] Getting token from ${REMITA_BASE_URL}/public/access_token`);
  const response = await fetch(`${REMITA_BASE_URL}/public/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: REMITA_USERNAME, password: REMITA_PASSWORD }),
  });

  const responseText = await response.text();
  console.log(`[REMITA] Token response ${response.status}: ${responseText.substring(0, 200)}`);

  if (!response.ok) {
    throw new Error(`Remita auth failed: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText) as { access_token?: string; token?: string; refresh_token?: string; expires_in?: number };
  const accessToken = data.access_token || data.token;
  if (!accessToken) {
    throw new Error(`Remita auth: no token in response`);
  }

  cachedToken = {
    access_token: accessToken,
    refresh_token: data.refresh_token || '',
    expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
  };

  return cachedToken.access_token;
}

// Make authenticated request to Remita API
async function remitaRequest(method: 'POST' | 'GET', endpoint: string, body?: unknown): Promise<any> {
  if (!REMITA_API_KEY || !REMITA_API_ID) {
    console.log(`[REMITA][SIMULATION] ${method} ${endpoint}`, body ? JSON.stringify(body) : '');
    return { success: true, transactionId: `SIM-${Date.now()}`, transactionStatus: 'PENDING', simulated: true };
  }

  const token = await getToken();

  console.log(`[REMITA] ${method} ${REMITA_BASE_URL}${endpoint}`);
  if (body) console.log(`[REMITA] Body: ${JSON.stringify(body)}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apiKey': REMITA_API_KEY,
    'apiId': REMITA_API_ID,
    'Authorization': `Bearer ${token}`,
  };

  const options: RequestInit = { method, headers };
  if (body && method === 'POST') options.body = JSON.stringify(body);

  const response = await fetch(`${REMITA_BASE_URL}${endpoint}`, options);
  const responseText = await response.text();
  console.log(`[REMITA] Response ${response.status}: ${responseText.substring(0, 300)}`);

  if (!response.ok) {
    // Handle 401 — token expired, retry once
    if (response.status === 401 && cachedToken) {
      cachedToken = null;
      return remitaRequest(method, endpoint, body);
    }
    const error = responseText ? JSON.parse(responseText) : { message: 'Unknown error' };
    throw new Error(`Remita API ${response.status}: ${error.message || responseText.substring(0, 150)}`);
  }

  return responseText ? JSON.parse(responseText) : {};
}

export interface CollectPaymentParams {
  phoneNumber: string;
  amount: number;
  customerName: string;
  transferMethod: string; // OMCM, MOMOCM, etc.
  countryName: string; // CAMEROON, IVORY_COAST, etc.
  externalId?: string;
  webhookUrl?: string;
}

export interface CollectPaymentResult {
  success: boolean;
  transactionId: string;
  status: string;
  externalId?: string;
  simulated?: boolean;
  error?: string;
}

// Collect payment (debit client)
export async function collectPayment(params: CollectPaymentParams): Promise<CollectPaymentResult> {
  try {
    const body: Record<string, unknown> = {
      transferMethod: params.transferMethod,
      customerName: params.customerName,
      externalId: params.externalId || crypto.randomUUID(),
      phoneNumber: params.phoneNumber.replace(/[^\d]/g, ''), // digits only, no +
      amount: params.amount,
      countryName: params.countryName,
    };
    // Include webhook URL if configured (from env or param)
    const webhookUrl = params.webhookUrl || REMITA_WEBHOOK_URL;
    if (webhookUrl) body.webhookUrl = webhookUrl;

    const result = await remitaRequest('POST', '/api/v1/transaction/collect', body);

    return {
      success: true,
      transactionId: result.transactionId || result.id || '',
      status: result.transactionStatus || result.status || 'PENDING',
      externalId: (body.externalId as string),
      simulated: result.simulated,
    };
  } catch (err) {
    console.error('[REMITA] Collect payment error:', err);
    const message = (err as Error).message || '';
    if (message.includes('ENOTFOUND') || message.includes('fetch failed')) {
      return { success: false, transactionId: '', status: 'FAILED', error: 'API Remita injoignable.' };
    }
    return { success: false, transactionId: '', status: 'FAILED', error: message };
  }
}

// Check transaction status
export async function checkTransactionStatus(transactionId: string): Promise<any> {
  if (!REMITA_API_KEY) {
    return { transactionId, status: 'SUCCESS', simulated: true };
  }
  return remitaRequest('POST', `/api/v1/transaction/transaction-status?id=${transactionId}`);
}

// Get balances
export async function getBalances(): Promise<any> {
  if (!REMITA_API_KEY) {
    return { orangeCollectBalance: 0, mtnCollectBalance: 0, simulated: true };
  }
  return remitaRequest('GET', '/api/v1/transaction/getByApplicationProductBalances');
}

// List transactions
export async function listTransactions(page = 0, size = 20): Promise<any> {
  if (!REMITA_API_KEY) {
    return { content: [], totalElements: 0, simulated: true };
  }
  return remitaRequest('GET', `/api/v1/transaction/getByApplicationProduct?page=${page}&size=${size}`);
}

export default { collectPayment, checkTransactionStatus, getBalances, listTransactions };