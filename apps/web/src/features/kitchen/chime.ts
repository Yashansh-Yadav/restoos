"use client";

// New-ticket chime (M5-T3): two short tones made with the Web Audio API — no audio file to
// load. Browsers only allow sound after a user gesture, so the kitchen taps "Turn On Sound"
// once (remembered on this tablet).

const KEY = "restoos.kitchen.sound";
let ctx: AudioContext | null = null;

export function soundWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundWanted(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode etc.: sound just won't be remembered.
  }
}

/** Call from a tap: unlocks audio for the page. Returns false if the browser has no audio. */
export async function unlockSound(): Promise<boolean> {
  if (typeof window === "undefined" || !("AudioContext" in window)) return false;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx.state === "running";
}

export function soundReady(): boolean {
  return ctx?.state === "running";
}

export function playChime() {
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
