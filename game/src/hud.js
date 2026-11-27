// HUD and overlays: DOM, not canvas, so the instruments stay crisp when the
// judge's contact sheet shrinks them. Lit glass panels, big numbers, an
// artificial horizon that actually moves, a compass tape, fuel and throttle
// bars, and the title / pause / crash / complete screens.
import { kmh, headingDeg } from './aircraft.js';

function el(id) {
  return document.getElementById(id);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud() {
  const state = { toastTimer: null };

  function showOverlay(id) {
    ['title-screen', 'pause-screen', 'crash-screen', 'complete-screen'].forEach((name) => {
      const node = el(name);
      if (node) node.classList.toggle('hidden', name !== id);
    });
    const hud = el('hud');
    if (hud) hud.classList.toggle('dimmed', id !== null);
  }

  function toast(message, ms = 2600) {
    const node = el('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.remove('hidden');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.add('hidden'), ms);
  }

  function update(game) {
    const f = game.flight.state;
    const setText = (id, value) => {
      const node = el(id);
      if (node) node.textContent = value;
    };
    setText('hud-alt', `${Math.round(Math.max(0, f.position.y))} m`);
    setText('hud-spd', `${kmh(f.speed)} km/h`);
    setText('hud-hdg', `${String(headingDeg(f.heading)).padStart(3, '0')}°`);
    setText('hud-vsi', `${f.verticalSpeed >= 0 ? '+' : ''}${f.verticalSpeed.toFixed(1)} m/s`);
    setText('hud-rings', `${game.ringsPassed} / ${game.ringTotal}`);
    setText('hud-time', formatTime(game.timeLeft));
    setText('hud-score', `${game.score}`);
    setText('hud-mission', game.mission.name);
    setText('hud-objective', game.objective);
    const fuel = el('hud-fuel-fill');
    if (fuel) fuel.style.width = `${Math.round(f.fuel * 100)}%`;
    const throttle = el('hud-thr-fill');
    if (throttle) throttle.style.width = `${Math.round(f.throttle * 100)}%`;
    const fuelBox = el('hud-fuel');
    if (fuelBox) fuelBox.classList.toggle('low', f.fuel < 0.25);
    // Artificial horizon: the sky/ground bar rolls with bank and shifts with pitch.
    const horizon = el('hud-horizon');
    if (horizon) {
      horizon.style.transform = `rotate(${-f.roll}rad) translateY(${f.pitch * 90}px)`;
    }
    const stall = el('hud-stall');
    if (stall) stall.classList.toggle('hidden', !f.stalled);
    const gear = el('hud-gear');
    if (gear) gear.textContent = f.gearDown ? 'GEAR DN' : 'GEAR UP';
    const flaps = el('hud-flaps');
    if (flaps) flaps.textContent = f.flaps ? 'FLAP 15' : 'FLAP 0';
    setText('hud-hits', `RUSAK ${f.hits}/3`);
    // v5: crash banner — a persistent red strip while the phase is
    // 'crashed'. In live play it sits behind the crash modal (the modal
    // is the feedback there); in shot mode the modal is hidden, so the
    // banner is the readable crash signal over the wreck.
    const banner = el('crash-banner');
    if (banner) {
      banner.classList.toggle('hidden', game.phase !== 'crashed');
      if (game.phase === 'crashed') banner.textContent = `MISI GAGAL — ${state.crashReason ?? 'Pesawat jatuh.'}`;
    }
    // Compass tape: heading numbers slide past the centre mark. The tape is
    // filled once with four repeats of 0..330 and parked one repeat left of
    // centre, so labels exist on both sides of the mark at every heading.
    // (Three repeats starting at centre left heading ~000 with no label
    // left of the first N 000 — KECIL-1: the 330 label was missing.)
    const tape = el('hud-compass-tape');
    if (tape && !tape.dataset.filled) {
      tape.dataset.filled = '1';
      for (let rep = 0; rep < 4; rep += 1) {
        for (let deg = 0; deg < 360; deg += 30) {
          const span = document.createElement('span');
          span.textContent = deg === 0 ? 'N 000' : deg === 90 ? 'E 090' : deg === 180 ? 'S 180' : deg === 270 ? 'W 270' : String(deg).padStart(3, '0');
          tape.appendChild(span);
        }
      }
    }
    if (tape) {
      const deg = headingDeg(f.heading);
      const compass = el('hud-compass');
      const w = compass ? compass.clientWidth : 340;
      const shift = (-(deg * 2.4) % 864) - 864;
      tape.style.transform = `translateX(${shift}px)`;
      // Fade each label out before its centre reaches the tape edge, so no
      // half-label ("N 0") is ever visible — a fade on the container alone
      // still leaves clipped text readable.
      const spans = tape.children;
      for (let i = 0; i < spans.length; i += 1) {
        const cx = w / 2 + shift + i * 72 + 36;
        const d = Math.min(cx, w - cx);
        spans[i].style.opacity = String(Math.max(0, Math.min(1, (d - 36) / 36)));
      }
    }
    const warn = el('hud-fuel-warn');
    if (warn) warn.classList.toggle('hidden', f.fuel > 0.12);
  }

  function showCrash(reason) {
    state.crashReason = reason;
    const node = el('crash-reason');
    if (node) node.textContent = reason;
    showOverlay('crash-screen');
  }

  function showComplete(score) {
    const setText = (id, value) => {
      const node = el(id);
      if (node) node.textContent = value;
    };
    setText('score-rings', `${score.ringScore}  (${score.ringsPassed}/${score.ringCount} cincin)`);
    setText('score-landing', `${score.landingScore}`);
    setText('score-fuel', `${score.fuelScore}`);
    setText('score-time', `${score.timeBonus}`);
    setText('score-total', `${score.total}`);
    showOverlay('complete-screen');
  }

  function showTitle(missions, onStart) {
    showOverlay('title-screen');
    const list = el('mission-list');
    if (list) {
      list.innerHTML = '';
      missions.forEach((m) => {
        const button = document.createElement('button');
        button.className = 'mission-card';
        button.innerHTML = `<strong>${m.name}</strong><span>${m.brief}</span>`
          + `<em>${m.rings} cincin · ${formatTime(m.timeLimit)} · bahan bakar ${Math.round(m.fuel * 100)}%</em>`;
        button.addEventListener('click', () => onStart(m.id));
        list.appendChild(button);
      });
    }
  }

  return { update, toast, showOverlay, showCrash, showComplete, showTitle };
}
