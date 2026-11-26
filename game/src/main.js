// Boot + game loop + state machine. Fixed-step simulation (60 Hz) so the
// flight model behaves the same on every machine; rendering interpolates
// nothing — the mesh is written straight from the state each frame.
// States: title → flying → paused → crashed / complete. Shot mode
// (?shot=...) skips the title and freezes a photogenic moment for screenshots.
import * as THREE from 'three';
import { MISSIONS, WORLD, PLANE } from './config.js';
import { heightAt, buildTerrain, isOverRunway, isOverWater } from './terrain.js';
import { buildSky } from './sky.js';
import { buildPlaneMesh, createFlightModel } from './aircraft.js';
import { buildRings, updateRings } from './rings.js';
import { missionById, spawnFor, COURSES, scoreRun } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { parseShot } from './shots.js';

const STEP = 1 / 60;
const MAX_STEPS = 8; // headless SwiftShader runs ~2.5 fps; 8 steps keep sim time sane there
const RUNWAY = WORLD.runway;

function boot() {
  const params = new URLSearchParams(window.location.search);
  const lite = params.get('lite') === '1'; // headless playtests: no shadows, DPR 1
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
  camera.position.set(330, 140, 1200);

  const sky = buildSky(scene, renderer);
  const terrain = buildTerrain(scene);
  const plane = buildPlaneMesh();
  scene.add(plane.group);
  scene.add(plane.cockpit);
  const flight = createFlightModel();
  const hud = createHud();
  const audio = createAudio();

  const game = {
    phase: 'title', // title | flying | paused | crashed | complete
    mission: MISSIONS[0],
    ringsPassed: 0,
    ringTotal: 8,
    score: 0,
    elapsed: 0,
    timeLeft: MISSIONS[0].timeLimit,
    objective: 'Pilih misi untuk mulai terbang.',
    cameraMode: 'chase',
    shotMode: null,
    // Mean sink (m/s, positive when descending) over the last ~0.5 s, for
    // the landing check; per-frame spikes must not decide a touchdown.
    lastAvgSink: 0,
    // Per-ring flags: true when the turn AFTER that ring exceeds 80 deg.
    sharpTurns: null,
    flight,
    rings: null,
    ringGroup: null,
  };

  let ringData = null;
  // Ring buffer of the last 30 vertical-speed samples (0.5 s at 60 Hz).
  const sinkBuffer = [];

  function loadMission(missionId) {
    game.mission = missionById(missionId);
    game.ringsPassed = 0;
    game.ringTotal = COURSES[missionId].length;
    game.score = 0;
    game.elapsed = 0;
    game.timeLeft = game.mission.timeLimit;
    game.objective = `Terbang melewati cincin ${game.ringsPassed + 1}/${game.ringTotal}`;
    if (game.ringGroup) {
      scene.remove(game.ringGroup);
      game.ringGroup.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
      });
    }
    ringData = buildRings(scene, COURSES[missionId]);
    game.ringGroup = ringData.group;
    game.rings = ringData.rings;
    // Sharp turns: the heading change at each interior ring, in the xz
    // plane. Passing such a ring earns a one-line warning toast, so the
    // pilot is not surprised by the wall of rock after the gate.
    const course = COURSES[missionId];
    game.sharpTurns = course.map((p, i) => {
      if (i === 0 || i === course.length - 1) return false;
      const a1 = Math.atan2(p.x - course[i - 1].x, -(p.z - course[i - 1].z));
      const a2 = Math.atan2(course[i + 1].x - p.x, -(course[i + 1].z - p.z));
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) > (80 * Math.PI) / 180;
    });
    sinkBuffer.length = 0;
    game.lastAvgSink = 0;
    sky.setTimeOfDay(game.mission.timeOfDay);
    flight.reset(spawnFor(missionId));
    flight.sync(plane);
  }

  function startMission(missionId) {
    audio.ensure();
    loadMission(missionId);
    game.phase = 'flying';
    hud.showOverlay(null);
    hud.toast(`${game.mission.name} — lepas landas! W/S throttle, mouse untuk belok.`);
  }

  function crash(reason) {
    if (game.phase !== 'flying') return;
    game.phase = 'crashed';
    flight.state.speed = 0;
    audio.thump();
    hud.showCrash(reason);
  }

  function complete() {
    if (game.phase !== 'flying') return;
    game.phase = 'complete';
    const landingSoftness = Math.max(0, 1 - Math.abs(game.lastAvgSink) / PLANE.landingMaxSink);
    const result = scoreRun({
      ringsPassed: game.ringsPassed,
      ringCount: game.ringTotal,
      landingSoftness,
      fuelLeft: flight.state.fuel,
      elapsed: game.elapsed,
      par: game.mission.scorePar,
    });
    game.score = result.total;
    audio.thump();
    hud.showComplete(result);
    saveBest(game.mission.id, result.total);
  }

  function saveBest(missionId, total) {
    try {
      const key = `cakrawala.best.${missionId}`;
      const prev = Number(window.localStorage.getItem(key) || 0);
      if (total > prev) window.localStorage.setItem(key, String(total));
    } catch (error) { /* storage is a bonus, never a failure */ }
  }

  function applyShot(shot) {
    game.shotMode = shot;
    loadMission(shot.missionId);
    const f = flight.state;
    const a = shot.aircraft;
    f.position.set(a.x, a.y, a.z);
    f.heading = a.heading;
    f.pitch = a.pitch;
    f.roll = a.roll;
    f.speed = a.speed;
    f.throttle = a.throttle;
    f.fuel = a.fuel;
    f.verticalSpeed = a.vspeed ?? 0;
    f.onGround = a.onGround ?? false;
    f.gearDown = a.gearDown ?? true;
    f.flaps = a.flaps ?? false;
    input.setThrottle(a.throttle);
    game.ringsPassed = shot.ringsPassed;
    game.score = shot.ringsPassed * 100;
    game.elapsed = shot.elapsed;
    game.timeLeft = game.mission.timeLimit - shot.elapsed;
    game.cameraMode = shot.camera;
    game.rings.forEach((ring, i) => {
      ring.group.userData.passed = i < shot.ringsPassed;
    });
    game.objective = `Terbang melewati cincin ${game.ringsPassed + 1}/${game.ringTotal}`;
    game.phase = 'flying';
    hud.showOverlay(null);
    hud.update(game);
    flight.sync(plane);
    updateCamera(0);
    renderer.render(scene, camera);
  }

  const input = createInput((action) => {
    if (action === 'camera') {
      game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
      hud.toast(game.cameraMode === 'chase' ? 'Kamera: Chase' : 'Kamera: Kokpit');
    }
    if (action === 'pause' && (game.phase === 'flying' || game.phase === 'paused')) {
      game.phase = game.phase === 'flying' ? 'paused' : 'flying';
      hud.showOverlay(game.phase === 'paused' ? 'pause-screen' : null);
    }
    if (action === 'restart' && game.phase !== 'title') startMission(game.mission.id);
    if (action === 'mute') {
      const muted = audio.toggleMute();
      hud.toast(muted ? 'Suara mati' : 'Suara hidup');
    }
    if (action === 'flaps') {
      flight.state.flaps = !flight.state.flaps;
      hud.toast(flight.state.flaps ? 'Flap turun' : 'Flap naik');
    }
    if (action === 'gear') {
      flight.state.gearDown = !flight.state.gearDown;
      hud.toast(flight.state.gearDown ? 'Roda turun' : 'Roda naik');
    }
    if (action === 'brake') flight.state.speed = Math.max(0, flight.state.speed - 12);
  });

  // Chase camera: behind and above the aircraft, smoothed; cockpit camera:
  // at the pilot's seat, looking forward over the nose.
  const camPos = new THREE.Vector3(330, 140, 1200);
  const camTarget = new THREE.Vector3(330, 120, 1000);
  function updateCamera(dt) {
    const f = flight.state;
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(f.pitch, f.heading, f.roll, 'YXZ'),
    );
    if (game.cameraMode === 'cockpit') {
      const seat = f.position.clone()
        .addScaledVector(forward, 2.2)
        .add(new THREE.Vector3(0, 1.0, 0));
      camPos.copy(seat);
      // Look slightly down so the panel sits in the lower third.
      camTarget.copy(f.position).addScaledVector(forward, 120).add(new THREE.Vector3(0, -3, 0));
      camera.position.copy(camPos);
      // The camera rides with the airframe: the panel stays level in frame
      // and the horizon tilts when banking — the reverse reads as a render bug.
      camera.up.copy(new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(f.pitch, f.heading, f.roll, 'YXZ')));
      camera.lookAt(camTarget);
      camera.fov = 68;
      camera.updateProjectionMatrix();
      plane.group.visible = false;
      plane.cockpit.visible = true;
    } else {
      plane.group.visible = true;
      plane.cockpit.visible = false;
      const behind = f.position.clone()
        .addScaledVector(forward, -22)
        .add(new THREE.Vector3(0, 7.5, 0));
      const snap = game.shotMode ? 1 : Math.min(1, dt * 5);
      camPos.lerp(behind, snap);
      camTarget.lerp(f.position.clone().addScaledVector(forward, 60), Math.min(1, dt * 7 || 1));
      camera.position.copy(camPos);
      // Roll the camera a little with the bank, so turns feel like turns.
      camera.up.set(Math.sin(-f.roll * 0.35), Math.cos(f.roll * 0.35), 0);
      camera.lookAt(camTarget);
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  }

  function simulate(dt) {
    const f = flight.state;
    if (game.phase !== 'flying') return;
    // Shot mode freezes the pose: the frame is deterministic, the world
    // (clouds, smoke, prop) still moves around it.
    if (game.shotMode) {
      f.propAngle += dt * 34;
      return;
    }
    game.elapsed += dt;
    game.timeLeft = Math.max(0, game.mission.timeLimit - game.elapsed);
    if (game.timeLeft <= 0 && game.ringsPassed < game.ringTotal) {
      crash('Waktu habis — misi gagal. Coba lagi!');
      return;
    }
    const polled = input.poll(dt);
    flight.setInput(polled);
    const ground = heightAt(f.position.x, f.position.z);
    flight.step(dt, ground, game.mission.wind);
    sinkBuffer.push(f.verticalSpeed);
    if (sinkBuffer.length > 30) sinkBuffer.shift();
    game.lastAvgSink = -(sinkBuffer.reduce((a, b) => a + b, 0) / sinkBuffer.length);
    audio.update({ throttle: f.throttle, speed: f.speed, airborne: !f.onGround });
    if (f.stalled && Math.floor(game.elapsed * 2) !== Math.floor((game.elapsed - dt) * 2)) {
      audio.stallHorn(true);
    }
    // Takeoff roll: on the runway the aircraft stays on the ground until it
    // is fast enough to lift; steering on the ground follows the runway.
    if (f.onGround) {
      const liftSpeed = f.flaps ? 46 : 54;
      if (f.speed > liftSpeed && f.throttle > 0.4) {
        f.onGround = false;
        hud.toast('Lepas landas!');
      } else {
        f.position.y = ground + 3;
        f.pitch = 0;
        f.roll *= 0.9;
      }
    }
    // Taxiing into the sea is a crash, on the ground as well as in the air.
    if (f.onGround && isOverWater(f.position.x, f.position.z)) {
      crash('Mendarat di laut — pesawat tenggelam.');
      return;
    }
    // Rings: crossing the next gate scores and advances the objective.
    if (ringData && game.ringsPassed < game.ringTotal) {
      const passed = updateRings(game.rings, f.position, game.ringsPassed, game.elapsed);
      if (passed >= 0) {
        game.ringsPassed += 1;
        game.score += 100;
        audio.ringChime();
        if (game.ringsPassed >= game.ringTotal) {
          game.objective = 'Semua cincin dilewati — mendarat di landasan!';
          hud.toast('Semua cincin dilewati! Sekarang mendarat.');
        } else {
          game.objective = `Terbang melewati cincin ${game.ringsPassed + 1}/${game.ringTotal}`;
          hud.toast(game.sharpTurns[passed]
            ? `Cincin ${game.ringsPassed}/${game.ringTotal} — belok tajam, ikuti cincin!`
            : `Cincin ${game.ringsPassed}/${game.ringTotal}!`);
        }
      }
    }
    // Fuel out mid-air: glide to the nearest ground — the mission is over
    // when the aircraft stops, so a dead-stick landing still counts.
    if (f.fuel <= 0 && f.speed < 20 && !f.onGround) {
      crash('Bahan bakar habis — pesawat jatuh.');
      return;
    }
    // Ground contact: landing or crash, decided by where and how hard.
    // The sink is the 0.5 s average, so a single headless burst frame
    // cannot turn a gentle touchdown into a crash.
    const clearance = f.position.y - ground;
    if (clearance <= 2.5 && !f.onGround) {
      const overRunway = isOverRunway(f.position.x, f.position.z);
      const sink = game.lastAvgSink;
      const gentle = sink <= PLANE.landingMaxSink && f.speed <= PLANE.landingMaxSpeed;
      if (overRunway && f.gearDown && gentle && game.ringsPassed >= game.ringTotal) {
        f.onGround = true;
        f.position.y = ground + 3;
        complete();
        return;
      }
      if (overRunway && f.gearDown && gentle) {
        // Touch-and-go on the strip before the rings are done: roll on.
        f.onGround = true;
        f.position.y = ground + 3;
        audio.thump();
        hud.toast('Mendarat — lepas landas lagi untuk lanjut misi.');
        return;
      }
      if (isOverWater(f.position.x, f.position.z)) {
        crash('Mendarat di laut — pesawat tenggelam.');
        return;
      }
      f.hits += 1;
      if (f.hits >= PLANE.hitsToCrash) {
        crash('Menabrak tanah — pesawat hancur.');
        return;
      }
      // A hard bounce: keep enough speed to fly out of it (never below
      // stall + 8) and grant 1.5 s of stall grace, so one impact cannot
      // chain into a second and third through the stall nose-drop.
      f.speed = Math.max(f.speed * 0.6, PLANE.stallSpeed + 8);
      f.position.y = ground + 6;
      f.pitch = 0.12;
      f.bounceGrace = 1.5;
      hud.toast(`Benturan keras! Kerusakan ${f.hits}/${PLANE.hitsToCrash}`);
    }
    if (f.position.y > 1500) {
      f.position.y = 1500;
      f.pitch = Math.min(f.pitch, 0);
    }
    if (Math.abs(f.position.x) > 2400 || Math.abs(f.position.z) > 2400) {
      hud.toast('Kamu keluar dari area — putar balik!');
      f.heading += Math.PI * dt * 0.25;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - (frame.last ?? now)) / 1000 || 0.016);
    frame.last = now;
    frame.acc = (frame.acc ?? 0) + dt;
    let steps = 0;
    while (frame.acc >= STEP && steps < MAX_STEPS) {
      simulate(STEP);
      frame.acc -= STEP;
      steps += 1;
    }
    if (game.phase === 'flying' || game.phase === 'crashed' || game.phase === 'complete') {
      flight.sync(plane);
      updateCamera(dt);
      sky.update(dt, game.elapsed, flight.state.position);
      terrain.windsock.rotation.y = 1.1 + Math.sin(game.elapsed * 0.7) * 0.2;
      const smokePos = terrain.smoke.geometry.attributes.position;
      for (let i = 0; i < smokePos.count; i += 1) {
        smokePos.setY(i, smokePos.getY(i) + dt * 6);
        if (smokePos.getY(i) > heightAt(WORLD.volcano.x, WORLD.volcano.z) + 420) {
          smokePos.setY(i, heightAt(WORLD.volcano.x, WORLD.volcano.z) + 30);
        }
      }
      smokePos.needsUpdate = true;
    }
    hud.update(game);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Buttons on the overlays.
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    game.phase = 'flying';
    hud.showOverlay(null);
  });
  document.getElementById('retry-btn')?.addEventListener('click', () => startMission(game.mission.id));
  document.getElementById('title-retry-btn')?.addEventListener('click', () => {
    hud.showTitle(MISSIONS, startMission);
  });
  document.getElementById('next-btn')?.addEventListener('click', () => {
    const idx = MISSIONS.findIndex((m) => m.id === game.mission.id);
    startMission(MISSIONS[(idx + 1) % MISSIONS.length].id);
  });
  document.getElementById('again-btn')?.addEventListener('click', () => startMission(game.mission.id));
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    game.phase = 'title';
    hud.showTitle(MISSIONS, startMission);
  });

  // Debug + playtest hooks: state, scenario loading, named camera views.
  window.__game = {
    state() {
      const f = flight.state;
      return {
        phase: game.phase,
        mission: game.mission.id,
        position: { x: f.position.x, y: f.position.y, z: f.position.z },
        speed: f.speed, throttle: f.throttle, fuel: f.fuel,
        heading: f.heading, pitch: f.pitch, roll: f.roll,
        ringsPassed: game.ringsPassed, ringTotal: game.ringTotal,
        score: game.score, timeLeft: game.timeLeft, hits: f.hits,
        onGround: f.onGround, stalled: f.stalled,
      };
    },
    loadScenario(name) {
      const shot = parseShot(`?shot=${name}`);
      if (!shot) throw new Error(`unknown scenario ${name}`);
      applyShot(shot);
      return { state: name };
    },
    setView(name) {
      game.cameraMode = name;
      return { state: name };
    },
    startMission: (id) => startMission(id),
  };

  loadMission(MISSIONS[0].id);
  const shot = parseShot(window.location.search);
  if (shot) {
    applyShot(shot);
  } else {
    game.phase = 'title';
    hud.showTitle(MISSIONS, startMission);
  }
  requestAnimationFrame(frame);
}

boot();
