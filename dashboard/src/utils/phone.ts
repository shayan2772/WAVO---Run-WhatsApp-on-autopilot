import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js';

export interface CountryOption {
  iso2: CountryCode;
  name: string;
  dial: string;
  flag: string;
}

// Localized country names straight from the platform — no bundled name table to maintain.
const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

/** ISO-3166 alpha-2 → 🇵🇰 flag emoji (regional-indicator letters). */
export function flagEmoji(iso2: string): string {
  const cc = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return cc.replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

/** Every dialable country, sorted by name — powers the country picker. Built once at import. */
export const COUNTRIES: CountryOption[] = getCountries()
  .map(iso2 => ({
    iso2,
    name: regionNames?.of(iso2) ?? iso2,
    dial: getCountryCallingCode(iso2),
    flag: flagEmoji(iso2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Best-effort guess of the browser's country from its locale, for the picker default. */
export function guessDefaultCountry(fallback: CountryCode = 'PK'): CountryCode {
  try {
    const region = new Intl.Locale(navigator.language).region as CountryCode | undefined;
    if (region && COUNTRIES.some(c => c.iso2 === region)) return region;
  } catch {
    /* ignore */
  }
  return fallback;
}

// Stored numbers may be pure E.164 digits (e.g. "923001234567") or already "+..." — normalize to "+".
function withPlus(raw: string): string {
  const t = raw.trim();
  return t.startsWith('+') ? t : `+${t.replace(/[^\d]/g, '')}`;
}

/**
 * Format a stored phone for read-only display. Returns the international grouping
 * ("+92 300 1234567"), optionally prefixed with the country flag. Falls back to the
 * raw string if it can't be parsed, and to an em-dash when empty.
 */
export function formatPhoneDisplay(raw?: string | null, withFlag = false): string {
  if (!raw) return '—';
  const parsed = parsePhoneNumberFromString(withPlus(String(raw)));
  if (!parsed) return String(raw).trim();
  const intl = parsed.formatInternational();
  return withFlag && parsed.country ? `${flagEmoji(parsed.country)} ${intl}` : intl;
}

export { AsYouType, parsePhoneNumberFromString, getCountryCallingCode };
export type { CountryCode };
