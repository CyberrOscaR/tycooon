// Tiny synthesized sound effects with WebAudio: no audio files to download.
type Note = [freq: number, start: number, dur: number, wave?: OscillatorType, vol?: number];
const SOUNDS: Record<string, Note[]> = {
  buy: [[660, 0, 0.07], [990, 0.05, 0.09]],
  sell: [[520, 0, 0.08], [390, 0.06, 0.12]],
  error: [[170, 0, 0.18, 'square', 0.05]],
  level: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]],
  mission: [[784, 0, 0.1, 'triangle'], [1175, 0.09, 0.25, 'triangle']],
  event: [[880, 0, 0.18, 'triangle'], [660, 0.16, 0.18, 'triangle'], [880, 0.32, 0.25, 'triangle']],
  chat: [[1200, 0, 0.05, 'sine', 0.06]],
  win: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]],
};

let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('tycooon-muted') === '1'; } catch { return false; } })();
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('tycooon-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

export function play(name: keyof typeof SOUNDS) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, dur, wave = 'sine', vol = 0.12] of SOUNDS[name]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.02);
    }
  } catch { /* audio not available */ }
}
