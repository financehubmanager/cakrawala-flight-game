// Sound, synthesised in code with WebAudio — no audio files, no network.
// Engine drone tied to RPM, wind tied to airspeed, a chime for each ring, a
// thump for touchdown, a stall horn. Starts on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth plus a sub-octave sine, both following RPM.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sine';
      engineOsc2.frequency.value = 28;
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
      // Wind: looped noise through a band-pass, gain follows airspeed.
      const noiseLen = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuf;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
    } catch (error) {
      // Audio is decoration: a blocked context must never break the game.
      ctx = null;
    }
  }

  function update({ throttle, speed, airborne }) {
    if (!ctx || !engineOsc) return;
    if (ctx.state === 'suspended') ctx.resume();
    const rpm = 0.25 + throttle * 0.75;
    const now = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(52 + rpm * 68, now, 0.08);
    engineOsc2.frequency.setTargetAtTime(26 + rpm * 34, now, 0.08);
    engineGain.gain.setTargetAtTime(airborne ? 0.05 + rpm * 0.075 : 0.03 + rpm * 0.05, now, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.14, (speed / 132) * 0.14), now, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speed * 6, now, 0.15);
  }

  function blip(freq, at, dur, type = 'sine', vol = 0.2) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.05);
  }

  function ringChime() {
    blip(880, 0, 0.5);
    blip(1318, 0.09, 0.5);
  }

  function thump() {
    if (!ctx) return;
    const dur = 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + dur);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  function stallHorn(on) {
    if (!ctx) return;
    if (on) blip(220, 0, 0.3, 'square', 0.08);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { ensure, update, ringChime, thump, stallHorn, toggleMute };
}
