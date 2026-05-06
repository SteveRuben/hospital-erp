/**
 * Remita Payment Service
 * API Documentation: https://mansar-1.gitbook.io/mansar-remita
 * 
 * Supports: Orange Money, MTN Mobile Money
 * Base URL: https://api.remita.cm
 * Auth: apiKey + apiId + Bearer JWT token
 */

const REMITA_BASE_URL = process.env.REMITA_API_URL || 'https://api.remita.cm';
const REMITA_API_KEY = process.env.REMITA_API_KEY || '';
const REMITA_API_ID = process.env.REMITA_API_ID || '';
const REMITA_USERNAME = process.env.REMITA_USERNAME || '';
const REMITA_PASSWORD = process.env.REMITA_PASSWORD || '';

let cachedToken: { access_token: string; expires_at: number } | null = null;

// Get or refresh JWT token
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.access_token;
  }

  const response = await fetch(`${REMITA_BASE_URL}/public/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: REMITA_USERNAME, password: REMITA_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Remita auth failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // Refresh 60s before expiry
  };

  return cachedToken.access_token;
}

// Make authenticated request to Remita API
async function remitaRequest(endpoint: string, body: unknown): Promise<any> {
  if (!REMITA_API_KEY || !REMITA_API_ID) {
    // Simulation mode if no credentials
    console.log(`[REMITA][SIMULATION] ${endpoint}`, JSON.stringify(body));
    return { success: true, transactionId: `SIM-${Date.now()}`, status: 'PENDING', simulated: true };
  }

  const token = await getToken();

  const response = await fetch(`${REMITA_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apiKey': REMITA_API_KEY,
      'apiId': REMITA_API_ID,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Remita API error ${response.status}: ${(error as any).message || JSON.stringify(error)}`);
  }

  return response.json();
}

export interface CollectPaymentParams {
  phoneNumber: string;
  amount: number;
  currency?: string;
  description?: string;
  externalId?: string;
  provider?: 'orange_money' | 'mtn_momo';
}

export interface CollectPaymentResult {
  success: boolean;
  transactionId: string;
  status: string;
  simulated?: boolean;
  error?: string;
}

// Collect payment (Orange Money or MTN MoMo)
export async function collectPayment(params: CollectPaymentParams): Promise<CollectPaymentResult> {
  try {
    const result = await remitaRequest('/api/v1/transaction/collect', {
      phoneNumber: params.phoneNumber,
      amount: params.amount,
      currency: params.currency || 'XAF',
      description: params.description || 'Paiement Hospital ERP',
      externalId: params.externalId || `HERP-${Date.now()}`,
      provider: params.provider || 'orange_money',
    });

    return {
      success: true,
      transactionId: result.transactionId || result.id || `TXN-${Date.now()}`,
      status: result.status || 'PENDING',
      simulated: result.simulated,
    };
  } catch (err) {
    console.error('[REMITA] Collect payment error:', err);
    return { success: false, transactionId: '', status: 'FAILED', error: (err as Error).message };
  }
}

// Check transaction status
export async function checkTransactionStatus(transactionId: string): Promise<any> {
  if (!REMITA_API_KEY) {
    return { transactionId, status: 'COMPLETED', simulated: true };
  }

  const token = await getToken();
  const response = await fetch(`${REMITA_BASE_URL}/api/v1/transaction/status/${transactionId}`, {
    headers: {
      'apiKey': REMITA_API_KEY,
      'apiId': REMITA_API_ID,
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.json();
}

export default { collectPayment, checkTransactionStatus };