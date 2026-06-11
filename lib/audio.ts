// Shared rest-timer beep. iOS Safari/PWA only allows creating an AudioContext
// inside a user-gesture handler, so `primeAudio` is called from the "mark set
// complete" tap (which starts the rest timer); `playBeep` reuses that same
// context when the countdown reaches zero, possibly seconds later.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | undefined {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : undefined;
}

export function primeAudio(): void {
  try {
    if (!ctx) ctx = getCtx() ?? null;
    if (ctx?.state === "suspended") void ctx.resume();
  } catch {
    /* audio not available — visual flash still fires */
  }
}

export function playBeep(): void {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* audio not available — visual flash still fires */
  }
}
