// Sound effects and background music synthesized with WebAudio: no audio files to download.
type Note = [freq: number, start: number, dur: number, wave?: OscillatorType, vol?: number];
const SOUNDS: Record<string, Note[]> = {
  buy: [[660, 0, 0.07], [990, 0.05, 0.09]],
  coin: [[988, 0, 0.06, 'square', 0.05], [1319, 0.05, 0.16, 'square', 0.05]],
  sell: [[520, 0, 0.08], [390, 0.06, 0.12]],
  error: [[170, 0, 0.18, 'square', 0.05]],
  level: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.3]],
  mission: [[784, 0, 0.1, 'triangle'], [1175, 0.09, 0.25, 'triangle']],
  event: [[880, 0, 0.18, 'triangle'], [660, 0.16, 0.18, 'triangle'], [880, 0.32, 0.25, 'triangle']],
  chat: [[1200, 0, 0.05, 'sine', 0.06]],
  win: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.5]],
};

const pref = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const save = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* ignore */ } };

let ctx: AudioContext | null = null;
function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function tone(a: AudioContext, freq: number, at: number, dur: number, wave: OscillatorType, vol: number, out: AudioNode = a.destination) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.02, dur / 4)); // soft attack, no clicks
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

let muted = pref('tycooon-muted');
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  save('tycooon-muted', muted);
  return muted;
}

export function play(name: keyof typeof SOUNDS) {
  if (muted) return;
  try {
    const a = audio(), t0 = a.currentTime;
    for (const [freq, start, dur, wave = 'sine', vol = 0.12] of SOUNDS[name]) tone(a, freq, t0 + start, dur, wave, vol);
  } catch { /* audio not available */ }
}

// --- Background music: a calm I-vi-IV-V loop with pads, bass and a gentle arpeggio
const CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
const BASS = [65.4, 55, 87.3, 98];
const STEP = 60 / 92 / 2; // eighth notes at 92 BPM
let musicOn = pref('tycooon-music'), timer = 0, nextTime = 0, step = 0;
let bus: GainNode | null = null;

function schedule() {
  const a = audio();
  while (nextTime < a.currentTime + 0.6) {
    const bar = Math.floor(step / 8) % 4, s8 = step % 8, chord = CHORDS[bar];
    if (s8 === 0) {
      chord.forEach((f) => tone(a, f / 2, nextTime, STEP * 8.5, 'triangle', 0.05, bus!));
      tone(a, BASS[bar], nextTime, STEP * 3.5, 'sine', 0.12, bus!);
    }
    if (s8 === 4) tone(a, BASS[bar], nextTime, STEP * 3, 'sine', 0.09, bus!);
    if (s8 % 2 === 0 || (step * 7) % 5 < 2) tone(a, chord[[0, 1, 2, 1, 2, 0, 1, 2][s8]] * 2, nextTime, STEP * 1.6, 'sine', 0.045, bus!);
    nextTime += STEP;
    step++;
  }
}

function startMusic() {
  if (timer) return;
  try {
    const a = audio();
    bus = a.createGain();
    bus.gain.value = 0.5;
    bus.connect(a.destination);
    nextTime = a.currentTime + 0.1;
    timer = window.setInterval(schedule, 200);
  } catch { /* audio not available */ }
}
function stopMusic() {
  clearInterval(timer);
  timer = 0;
  bus?.disconnect();
  bus = null;
}

export const isMusicOn = () => musicOn;
export function toggleMusic() {
  musicOn = !musicOn;
  save('tycooon-music', musicOn);
  if (musicOn) startMusic();
  else stopMusic();
  return musicOn;
}
// Browsers only allow audio after a user gesture: resume the saved preference on the first tap.
if (musicOn) document.addEventListener('pointerdown', startMusic, { once: true });
