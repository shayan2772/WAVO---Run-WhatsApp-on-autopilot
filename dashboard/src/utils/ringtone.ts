/**
 * Attention ringtone — synthesized with the Web Audio API so it ships no binary asset and can't
 * 404 behind the proxy. A short, friendly two-note chime repeated a few times (a "someone needs
 * you" sound, not an alarm). Browsers block audio until a user gesture, so callers should invoke
 * `unlockAudio()` from a click once; we also self-unlock on the first pointer/key event.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Resume the audio context after a user gesture so scheduled tones are audible. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

// Self-unlock on the very first interaction anywhere in the app.
if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
}

function chimeAt(c: AudioContext, start: number, freq: number, duration: number, gainPeak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Quick attack, smooth exponential decay — a soft bell rather than a beep.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/**
 * Play the attention chime. `repeats` bars of a rising two-note motif.
 * Returns silently if audio is unavailable/blocked.
 */
export function playRingtone(repeats = 3): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime + 0.02;
  const bar = 0.66;
  for (let i = 0; i < repeats; i++) {
    const t = now + i * bar;
    chimeAt(c, t, 880, 0.28, 0.16); // A5
    chimeAt(c, t + 0.22, 1174.66, 0.4, 0.14); // D6
  }
}
