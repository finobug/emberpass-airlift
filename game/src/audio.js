// audio.js — every sound is synthesised with WebAudio: a two-oscillator
// engine whose pitch follows the throttle, filtered noise for the wind,
// and small blips for rings, warnings and touchdowns. No audio files.

let ctx = null;
let engineOsc = null, engineOsc2 = null, engineGain = null;
let windSrc = null, windGain = null, windFilter = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
  engineOsc2.start();

  // Wind: a looping noise buffer through a bandpass that opens with speed.
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  windSrc = ctx.createBufferSource();
  windSrc.buffer = buf;
  windSrc.loop = true;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 0.6;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  windSrc.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);
  windSrc.start();
}

// Called every frame in flight: throttle 0..1, airspeed in m/s.
export function setEngine(throttle, speedMs, running) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const rpm = running ? 0.25 + throttle * 0.75 : 0;
  engineOsc.frequency.setTargetAtTime(52 + rpm * 68, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(26 + rpm * 34, t, 0.08);
  engineGain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.075 : 0, t, 0.1);
  windFilter.frequency.setTargetAtTime(280 + speedMs * 16, t, 0.15);
  windGain.gain.setTargetAtTime(Math.min(0.16, speedMs * speedMs * 0.000045), t, 0.15);
}

export function stopEngine() {
  if (!ctx) return;
  engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
}

function blip(freq, dur, type, vol, when = 0, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function ringChime() { blip(880, 0.16, 'sine', 0.20); blip(1318, 0.24, 'sine', 0.16, 0.07); }
export function dropAway() { blip(340, 0.2, 'triangle', 0.18, 0, -160); }
export function stallBeep() { blip(1180, 0.09, 'square', 0.07); }
export function touchdownThud(hard) { blip(hard ? 90 : 120, 0.22, 'sine', 0.30, 0, -50); }
export function successJingle() { blip(660, 0.14, 'triangle', 0.18); blip(880, 0.14, 'triangle', 0.18, 0.12); blip(1100, 0.26, 'triangle', 0.18, 0.24); }
export function crashSound() { blip(140, 0.7, 'sawtooth', 0.30, 0, -110); blip(70, 0.9, 'square', 0.22, 0.05, -40); }
