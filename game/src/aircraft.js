// The Elang-7 bush plane: built from primitives (fuselage, wings, tail,
// spinning prop, nav lights, landing lights) so it reads as a built aircraft,
// plus the arcade flight model. The model is deliberately separate from the
// mesh: step() only moves numbers; sync() writes them into the scene graph.
import * as THREE from 'three';
import { PLANE, PALETTE } from './config.js';
import { clamp, lerp } from './rng.js';

export function buildPlaneMesh() {
  const group = new THREE.Group();
  group.name = 'elang-7';
  const orange = new THREE.MeshStandardMaterial({ color: PALETTE.planeOrange, roughness: 0.5, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: PALETTE.planeCream, roughness: 0.55, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.planeDark, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.6 });

  // Fuselage: a tapered cylinder pointing forward (-z is forward).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.55, 7.2, 10), orange);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.6, 10), cream);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -4.2;
  nose.castShadow = true;
  group.add(nose);
  // Canopy: a flattened half-sphere, glassy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.62, 1.5);
  canopy.position.set(0, 0.72, -1.4);
  group.add(canopy);
  // Main wings: high-wing, slight dihedral, cream with orange tips.
  const wingGeo = new THREE.BoxGeometry(13.4, 0.22, 2.1);
  const wing = new THREE.Mesh(wingGeo, cream);
  wing.position.set(0, 0.85, -0.6);
  wing.castShadow = true;
  group.add(wing);
  [-6.4, 6.4].forEach((x) => {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 2.1), orange);
    tip.position.set(x, 0.85, -0.6);
    group.add(tip);
  });
  // Tail: horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.5), cream);
  stab.position.set(0, 0.5, 3.4);
  group.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 1.9), orange);
  fin.position.set(0, 1.3, 3.5);
  group.add(fin);
  // Fixed landing gear: two wheels + struts.
  [-1.5, 1.5].forEach((x) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), dark);
    strut.position.set(x, -1.1, -1.2);
    strut.rotation.z = x > 0 ? 0.35 : -0.35;
    group.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x * 1.25, -1.85, -1.2);
    group.add(wheel);
  });
  // Propeller: hub + two blades, spun in sync().
  const prop = new THREE.Group();
  prop.position.set(0, 0, -5.15);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.34, 3.4, 0.12);
  const bladeA = new THREE.Mesh(bladeGeo, dark);
  prop.add(bladeA);
  const bladeB = new THREE.Mesh(bladeGeo, dark);
  bladeB.rotation.z = Math.PI / 2;
  prop.add(bladeB);
  group.add(prop);
  // Nav lights: red left, green right, white tail — small emissive spheres.
  const navMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), navMat(0xff2a2a));
  navL.position.set(-6.7, 0.85, -0.6);
  group.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), navMat(0x2aff66));
  navR.position.set(6.7, 0.85, -0.6);
  group.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), navMat(0xffffff));
  navT.position.set(0, 0.5, 4.1);
  group.add(navT);
  // Landing lights under the wings.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  [-3.4, 3.4].forEach((x) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), lampMat);
    lamp.position.set(x, 0.68, -1.5);
    group.add(lamp);
  });
  // Wing struts: a high-wing bush plane reads as built when the wing is
  // held up by struts, not floating. Diagonal cylinders, fuselage to wing.
  const strutMat = dark;
  function strutBetween(a, b, r) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), strutMat);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(mesh);
  }
  [-1, 1].forEach((s) => {
    strutBetween(new THREE.Vector3(s * 0.7, -0.7, -0.6), new THREE.Vector3(s * 3.4, 0.78, -0.6), 0.09);
  });
  // Spinner cone on the prop hub, orange.
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 10), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, 0, -5.5);
  group.add(spinner);
  // Prop tip markings: yellow stripes, so the spinning disc reads as a prop.
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  [[0, 1.55], [0, -1.55], [1.55, 0], [-1.55, 0]].forEach(([x, y]) => {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 0.36 : 0.5, y === 0 ? 0.36 : 0.5, 0.14), tipMat);
    tip.position.set(x, y, 0);
    prop.add(tip);
  });
  // Dorsal antenna + tail strobe + pitot tube + exhaust stacks + tail wheel.
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6), dark);
  antenna.position.set(0, 1.5, 1.6);
  antenna.rotation.x = 0.25;
  group.add(antenna);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 2.55, 3.5);
  group.add(strobe);
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(-3.4, 0.55, -1.9);
  group.add(pitot);
  [-0.35, 0.35].forEach((x) => {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 6), dark);
    exhaust.position.set(x, -0.72, -3.5);
    exhaust.rotation.x = 0.35;
    group.add(exhaust);
  });
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 8), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -1.15, 3.9);
  group.add(tailWheel);
  return { group, prop, cockpit: buildCockpit() };
}

// Cockpit interior, in plane-local coordinates (-z forward). Only visible in
// cockpit camera mode: a lit instrument panel, glareshield, A-pillars and a
// yoke, so the cockpit view reads as a cockpit instead of bare landscape.
function buildCockpit() {
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.85, metalness: 0.1 });

  const panel = createPanel();
  // Panel 2.1 m ahead of the seat: at 68° FOV it sits in the lower third
  // instead of swallowing the frame (v1 sat 1.4 m out and filled half of it).
  const panelFace = new THREE.MeshBasicMaterial({ map: panel.texture });
  const panelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.55, 0.1),
    [dark, dark, dark, dark, panelFace, dark],
  );
  panelMesh.position.set(0, 0.38, -4.3);
  panelMesh.rotation.x = -0.12;
  cockpit.add(panelMesh);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 0.3), dark);
  glare.position.set(0, 0.68, -4.25);
  cockpit.add(glare);
  cockpit.visible = false;
  cockpit.userData.updatePanel = panel.update;
  return cockpit;
}

// Painted instrument panel: airspeed, attitude, altimeter, fuel, RPM.
// The needles and the attitude horizon are redrawn from live flight state,
// so the panel reads as flown, not painted: the ATT horizon rolls with the
// bank and shifts with pitch, and every needle tracks the HUD numbers.
function createPanel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // Needle angle on the dial face: 0 = 3 o'clock, positive clockwise.
  const needle = (v) => -2.35 + clamp01(v) * 2.7;

  function dial(cx, cy, r, label, needleAngle, needleColor) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a4356';
    ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
      ctx.strokeStyle = '#c8cdd8';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * (r - 12), cy + Math.sin(needleAngle) * (r - 12));
    ctx.lineWidth = 3;
    ctx.strokeStyle = needleColor;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#c8cdd8';
    ctx.fill();
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#e8e4d8';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r + 16);
  }

  function update(state = {}) {
    const roll = state.roll ?? 0;
    const pitch = state.pitch ?? 0;
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, 512, 160);
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 160);
    // Attitude indicator: the horizon rolls with the bank and shifts with
    // pitch, so it can never contradict the world outside the windscreen.
    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 74, 52, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(256, 74);
    ctx.rotate(-roll);
    ctx.translate(0, Math.max(-0.4, Math.min(0.4, pitch)) * 55);
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(-52, -52, 104, 52);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-52, 0, 104, 52);
    ctx.strokeStyle = '#f4f1e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.lineTo(48, 0);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(256, 74, 52, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a4356';
    ctx.stroke();
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#f4f1e8';
    ctx.textAlign = 'center';
    ctx.fillText('ATT', 256, 74 + 52 - 20);
    dial(104, 74, 52, 'KT', needle((state.speedKmh ?? 0) / 475), '#ffb020');
    dial(408, 74, 52, 'ALT', needle((state.altM ?? 0) / 1500), '#7fe3f0');
    dial(472, 74, 26, 'FUEL', needle(state.fuel ?? 1), '#3ddc78');
    dial(40, 74, 26, 'RPM', needle(state.throttle ?? 0), '#ffb020');
    tex.needsUpdate = true;
  }

  update({});
  return { texture: tex, update };
}

export function createFlightModel() {
  // State is numbers only: position, heading/pitch/roll, speed, throttle,
  // fuel, damage. The mesh is a view of this state.
  const state = {
    position: new THREE.Vector3(330, 120, 1150),
    heading: 0, // 0 faces north (-z); heading grows clockwise as seen from above
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 1,
    hits: 0,
    flaps: false,
    gearDown: true,
    verticalSpeed: 0,
    stalled: false,
    // Seconds after a bounce during which a stall may warn but must not
    // force the nose down or sink the aircraft into a second impact.
    bounceGrace: 0,
    onGround: true,
    propAngle: 0,
  };
  const input = { pitch: 0, roll: 0, throttle: 0 };

  function reset(spawn) {
    state.position.set(spawn.x, spawn.y, spawn.z);
    state.heading = spawn.heading;
    state.pitch = 0;
    state.roll = 0;
    state.speed = spawn.speed ?? 0;
    state.throttle = spawn.throttle ?? 0;
    state.fuel = spawn.fuel ?? 1;
    state.hits = 0;
    state.flaps = false;
    state.gearDown = spawn.gearDown ?? true;
    state.verticalSpeed = 0;
    state.stalled = false;
    state.bounceGrace = 0;
    state.onGround = spawn.onGround ?? false;
    state.propAngle = 0;
  }

  function step(dt, groundHeight, wind) {
    // Throttle moves the target speed; the engine spools toward it.
    // On the ground at idle the aircraft brakes to a stop — the idle
    // speed floor only applies in the air (or with throttle applied).
    const idleTaxi = state.onGround && state.throttle < 0.05;
    const targetSpeed = idleTaxi ? 0
      : PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed)
      * (state.flaps ? 0.86 : 1);
    state.speed += clamp(targetSpeed - state.speed, -PLANE.accel * dt, PLANE.accel * dt);
    // Energy exchange: climbing costs speed, diving gives it back.
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(state.pitch, state.heading, state.roll, 'YXZ'),
    );
    state.speed -= Math.sin(state.pitch) * 9.8 * PLANE.dragOnClimb * dt;
    state.speed = clamp(state.speed, 0, PLANE.maxSpeed);
    // Stall: below stall speed with no power the nose drops and sinks.
    // During bounce grace the warning still shows (state.stalled) but the
    // nose-drop and the sink are suspended, so one impact cannot chain
    // into a second and third within a second.
    if (state.bounceGrace > 0) state.bounceGrace = Math.max(0, state.bounceGrace - dt);
    state.stalled = state.speed < PLANE.stallSpeed && !state.onGround;
    const stallActive = state.stalled && state.bounceGrace <= 0;
    const pitchTarget = stallActive
      ? -0.22
      : clamp(input.pitch, -1, 1) * PLANE.maxPitch * (state.flaps ? 0.8 : 1);
    const rollTarget = clamp(input.roll, -1, 1) * PLANE.maxRoll;
    state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    state.roll += clamp(rollTarget - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    // Bank turns the aircraft; the turn tightens with speed.
    const speedFactor = clamp(state.speed / PLANE.cruiseSpeed, 0.35, 1.4);
    state.heading -= Math.sin(state.roll) * PLANE.turnFactor * speedFactor * dt;
    // Wind pushes the aircraft sideways, stronger at altitude.
    const windPush = wind * (0.4 + clamp(state.position.y / 400, 0, 1) * 0.6);
    // Move along the forward vector; sink when stalled or slow on the ground.
    const prevY = state.position.y;
    state.position.addScaledVector(forward, state.speed * dt);
    state.position.x += Math.sin(1.1) * windPush * dt * 0.4;
    state.position.z += Math.cos(1.1) * windPush * dt * 0.2;
    if (stallActive) state.position.y -= 14 * dt;
    state.verticalSpeed = (state.position.y - prevY) / Math.max(dt, 0.0001);
    // Fuel: throttle burns the tank; empty means the engine quits.
    const burn = PLANE.fuelBurnIdle + state.throttle * (PLANE.fuelBurn - PLANE.fuelBurnIdle);
    state.fuel = Math.max(0, state.fuel - burn * dt);
    if (state.fuel <= 0) state.throttle = Math.max(0, state.throttle - dt * 0.5);
    // Prop spins with RPM.
    state.propAngle += (4 + state.throttle * 46 + state.speed * 0.12) * dt;
    return { groundHeight };
  }

  function sync(mesh) {
    mesh.group.position.copy(state.position);
    mesh.group.rotation.set(state.pitch, state.heading, state.roll, 'YXZ');
    mesh.prop.rotation.z = state.propAngle;
    if (mesh.cockpit) {
      mesh.cockpit.position.copy(state.position);
      mesh.cockpit.rotation.set(state.pitch, state.heading, state.roll, 'YXZ');
    }
  }

  function setInput(next) {
    input.pitch = next.pitch ?? input.pitch;
    input.roll = next.roll ?? input.roll;
    input.throttle = next.throttle ?? input.throttle;
    if (next.throttle !== undefined) state.throttle = clamp(next.throttle, 0, 1);
  }

  return { state, input, reset, step, sync, setInput };
}

export function kmh(speed) {
  return Math.round(speed * 3.6);
}

export function headingDeg(heading) {
  return Math.round((( -heading * 180) / Math.PI % 360 + 360) % 360);
}
