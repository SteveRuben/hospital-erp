/**
 * Display formatters shared across pages. Lightweight wrappers that:
 *   - tolerate missing/invalid input (return the raw value or empty string)
 *   - read the country/currency from the BrandingContext, not from the user's
 *     locale, because the establishment's identity is the source of truth for
 *     "what country/currency are we in"
 *
 * Components grab these via `useBranding()` then call the formatter.
 */

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Format a raw phone string into national or international form depending on
 * whether the country code is set. Returns the raw value unchanged when:
 *   - the value is empty
 *   - parsing fails (wrong digits, garbage input)
 *   - no country code is configured AND the value doesn't start with `+`
 *
 * That last fallback matters at first run: before the admin sets `code_pays`,
 * we'd rather show "690320123" untouched than mangle it into nonsense.
 */
export function formatPhone(value: string | null | undefined, countryCode?: string): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const country = countryCode && countryCode.length === 2 ? (countryCode.toUpperCase() as CountryCode) : undefined;
  try {
    const parsed = parsePhoneNumberFromString(raw, country);
    if (parsed && parsed.isValid()) {
      // International form when caller is outside the configured country,
      // but for the display layer "international" is more useful (shows the
      // country prefix unambiguously and prints well on documents).
      return parsed.formatInternational();
    }
  } catch { /* fall through to raw */ }
  return raw;
}

/**
 * Format a number as a money amount using the establishment's devise.
 * `XOF` and `XAF` (CFA francs) often render as "CFA" in browsers — that's
 * fine, the Intl API handles it correctly.
 */
export function formatMoney(amount: number | string | null | undefined, devise: string = 'XOF'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise, maximumFractionDigits: 0 }).format(n);
  } catch {
    // Currency code not recognized by the platform Intl tables — fall back
    // to plain number + devise suffix so the value still renders.
    return `${new Intl.NumberFormat('fr-FR').format(n)} ${devise}`;
  }
}
