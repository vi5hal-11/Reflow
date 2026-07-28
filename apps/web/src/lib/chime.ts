// A gentle two-tone bell, synthesized in the browser with Web Audio.
//
// Synthesized rather than a shipped audio file: nothing to download, it works
// offline, and we control the envelope so it can never clip or startle someone
// who has their eyes closed. A soft attack (never an instant onset) and a long
// exponential decay is what makes it read as a bell rather than a beep.
//
// iOS/Safari only unlock audio inside a user gesture, so `primeAudio()` must be
// called from the press that starts a timer — not at completion.

const SOUND_KEY = "reflow_timer_sound";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/** True unless the user has explicitly silenced the timer. */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true; // private mode — default to audible
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* preference just won't persist */
  }
}

/**
 * Create/resume the audio context. Call from a user gesture (the start press),
 * otherwise the chime is silently blocked when the timer finally ends.
 */
export function primeAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio unavailable — the visual ending and haptic still land */
  }
}

/** One sine partial with a soft attack and a long exponential tail. */
function partial(
  context: AudioContext,
  freq: number,
  at: number,
  duration: number,
  peak: number,
): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  // exponentialRamp can't touch zero, so ride just above it.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/**
 * The completion bell: a fundamental, a quieter fifth above it for shimmer, and
 * a low echo a beat later. Roughly 2s of decay, well under any startle threshold.
 */
export function playChime(): void {
  if (!soundEnabled()) return;
  try {
    primeAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    partial(ctx, 660, t, 1.8, 0.16);
    partial(ctx, 990, t + 0.02, 1.3, 0.07);
    partial(ctx, 440, t + 0.2, 2.0, 0.1);
  } catch {
    /* never let a decorative sound break the timer */
  }
}

/** A short haptic on phones that support it. Independent of the sound setting. */
export function buzz(): void {
  try {
    navigator.vibrate?.([180]);
  } catch {
    /* unsupported — fine */
  }
}
