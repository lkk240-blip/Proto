// WebAudio 로 만드는 짧은 효과음(외부 파일 없음). 브라우저 정책상 첫 키 입력 이후에만 소리가 난다.
let ctx = null;
let master = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

window.addEventListener('keydown', () => ac(), { once: true });
window.addEventListener('pointerdown', () => ac(), { once: true });

function tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, vol = 0.4, hp = 1000, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const Sfx = {
  dash: () => noiseBurst(0.12, 0.15, 2500),
  pickup: () => tone(520, 0.08, 'triangle', 0.25, 780),
  drop: () => tone(300, 0.08, 'triangle', 0.2, 200),
  bump: () => tone(140, 0.1, 'sine', 0.35, 70),
  crack: () => { noiseBurst(0.08, 0.5, 3000); tone(1800, 0.06, 'square', 0.15, 900); },
  break: () => {
    noiseBurst(0.5, 0.6, 1800);
    [2400, 3100, 2000, 3600].forEach((f, i) => tone(f, 0.12, 'triangle', 0.18, f * 0.7, i * 0.05));
  },
  throw: () => tone(400, 0.15, 'sine', 0.2, 900),
  catch: () => tone(660, 0.07, 'triangle', 0.25, 990),
  deposit: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'triangle', 0.25, null, i * 0.07)),
  swallow: () => tone(300, 0.2, 'sine', 0.35, 120),
  spit: () => tone(200, 0.15, 'sawtooth', 0.2, 500),
  gag: () => { tone(160, 0.35, 'sawtooth', 0.35, 90); noiseBurst(0.3, 0.3, 600); },
  suspect: () => tone(700, 0.12, 'sine', 0.2, 900),
  alert: () => { tone(900, 0.1, 'square', 0.25); tone(1200, 0.15, 'square', 0.25, null, 0.1); },
  caught: () => { tone(500, 0.3, 'sawtooth', 0.3, 100); noiseBurst(0.15, 0.3, 800); },
  swap: () => tone(440, 0.06, 'triangle', 0.18, 660),
  siren: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 600 : 900, 0.25, 'sawtooth', 0.22, null, i * 0.25); },
  coop: () => [392, 523].forEach((f, i) => tone(f, 0.1, 'triangle', 0.25, null, i * 0.06)),
};
