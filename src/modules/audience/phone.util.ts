// Normalize a phone number to bare E.164 digits (no '+', no separators). Returns null if it doesn't
// look like a dialable international number. Intentionally simple — the WhatsApp engine is the final
// authority on whether a number exists; this just dedups and sanitizes CSV input.
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, '');
  // Drop a leading "00" international prefix (e.g. 0092… → 92…).
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Reject obviously-too-short/long values (E.164 is 8–15 digits).
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}
