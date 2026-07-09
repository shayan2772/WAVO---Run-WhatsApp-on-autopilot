// Warm-up ramp for a WhatsApp number on the unofficial engine. New numbers send little and slowly;
// volume + speed increase with age. Derived from anti-ban guidance (start ~20-50/day at 30-90s
// spacing, ramp to ~1000/day at 6-15s over ~3-4 weeks). These are deliberately conservative — the
// residual ban risk of unofficial automation is never zero.
export interface WarmupTier {
  minAgeDays: number;
  dailyCap: number;
  minDelayMs: number;
  maxDelayMs: number;
}

const TIERS: WarmupTier[] = [
  { minAgeDays: 21, dailyCap: 1000, minDelayMs: 8_000, maxDelayMs: 15_000 },
  { minAgeDays: 14, dailyCap: 400, minDelayMs: 12_000, maxDelayMs: 25_000 },
  { minAgeDays: 7, dailyCap: 150, minDelayMs: 20_000, maxDelayMs: 45_000 },
  { minAgeDays: 0, dailyCap: 40, minDelayMs: 30_000, maxDelayMs: 90_000 },
];

/** Resolve the warm-up tier for a number given how many days ago it first connected. */
export function warmupTierForAge(ageDays: number): WarmupTier {
  return TIERS.find(t => ageDays >= t.minAgeDays) ?? TIERS[TIERS.length - 1];
}

/** Days since `firstReadyAt` (0 if unknown — treated as brand new = most conservative). */
export function numberAgeDays(firstReadyAt: Date | null | undefined, now = Date.now()): number {
  if (!firstReadyAt) return 0;
  return Math.max(0, Math.floor((now - new Date(firstReadyAt).getTime()) / (24 * 60 * 60 * 1000)));
}
