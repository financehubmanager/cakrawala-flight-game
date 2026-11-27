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
// cockpit camera mode: a lit instrument panel set into the dashboard, a
// glareshield hood, side cheeks, A-pillars and a control stick, so the
// cockpit view reads as a cockpit instead of bare landscape.
function buildCockpit() {
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.85, metalness: 0.1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.45, metalness: 0.55 });

  // v3: the panel is set INTO the dashboard now, not taped over the
  // windscreen. A mounting frame rims it, a glareshield hood overhangs it,
  // side cheeks tie it to the canopy frame, A-pillars frame the windscreen,
  // and a control stick sits in front of the pilot — the cockpit shot
  // reads as sitting in a seat instead of a card floating over a landscape.
  function strutBetween(a, b, r, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    cockpit.add(mesh);
  }

  // Mounting frame: a rim around the panel, so the panel reads as bolted
  // into the dashboard instead of floating in front of it.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.68, 0.05), metal);
  frame.position.set(0, 0.38, -4.44);
  frame.rotation.x = -0.12;
  cockpit.add(frame);

  const panel = createPanel();
  // Panel 2.1 m ahead of the seat: at 68° FOV it sits in the lower third
  // instead of swallowing the frame (v1 sat 1.4 m out and filled half of it).
  const panelFace = new THREE.MeshBasicMaterial({ map: panel.texture });
  const panelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.55, 0.16),
    [dark, dark, dark, dark, panelFace, dark],
  );
  panelMesh.position.set(0, 0.38, -4.3);
  panelMesh.rotation.x = -0.12;
  cockpit.add(panelMesh);

  // Glareshield hood: a sloped visor over the panel's top edge. Its front
  // edge meets the panel top, its back edge rises just above it — the band
  // of shade a real glareshield throws over the instruments.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.4), dark);
  hood.position.set(0, 0.78, -4.18);
  hood.rotation.x = 0.4;
  cockpit.add(hood);
  [-1, 1].forEach((s) => {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.45), dark);
    cheek.position.set(s * 1.02, 0.45, -4.1);
    cheek.rotation.y = -s * 0.25;
    cockpit.add(cheek);
  });

  // A-pillars: from the panel's top corners up and out, leaving through the
  // frame's top corners — the windscreen is framed, not open sky. Thin
  // (v5: 0.035 m, down from v4's 0.04 after the tester measured ~30 px in
  // the cockpit shot) and slightly metallic, so they read as structure
  // catching the sun instead of black girders. Framing is kept — the
  // struts still run panel corner to frame corner, just less dominant.
  [-1, 1].forEach((s) => {
    strutBetween(
      new THREE.Vector3(s * 0.98, 0.62, -4.25),
      new THREE.Vector3(s * 1.85, 2.15, -3.95),
      0.035, metal,
    );
  });

  // Control stick: a bush plane flies with a stick, not a yoke. A thin
  // column from the floor, leaning toward the pilot, with a grip and a red
  // trigger just below the panel's bottom edge — the foreground cue that
  // you are sitting in the seat.
  strutBetween(new THREE.Vector3(0, -0.35, -4.15), new THREE.Vector3(0, 0.16, -3.9), 0.045, metal);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.1), dark);
  grip.position.set(0, 0.18, -3.86);
  grip.rotation.x = 0.4;
  cockpit.add(grip);
  const trigger = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.06, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xe03c2e }),
  );
  trigger.position.set(0, 0.22, -3.8);
  trigger.rotation.x = 0.4;
  cockpit.add(trigger);

  cockpit.visible = false;
  cockpit.userData.updatePanel = panel.update;
  return cockpit;
}

// Painted instrument panel: airspeed, attitude, altimeter, fuel, RPM.
// The needles and the attitude horizon are redrawn from live flight state,
// so the panel reads as flown, not painted: the ATT horizon rolls with the
// bank and shifts with pitch, and every needle tracks the HUD numbers.
// v3: the panel is a real instrument panel now — machined metal face,
// corner screws, metal bezels with glass, numbered dials, redlines, and a
// fixed attitude symbol — so the cockpit shot reads as a cockpit, not a card.
function createPanel() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // Needle angle on the dial face: 0 = 3 o'clock, positive clockwise.
  const needleAngle = (v) => -2.35 + clamp01(v) * 2.7;

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function screw(x, y) {
    const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
    g.addColorStop(0, '#e9edf3');
    g.addColorStop(0.6, '#7d838e');
    g.addColorStop(1, '#2c3038');
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#0a0c0f'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y + 1);
    ctx.lineWidth = 2; ctx.strokeStyle = '#1c1f24'; ctx.stroke();
  }

  // A real gauge: metallic bezel ring, a groove, then the dark face.
  function bezel(cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r + 7);
    g.addColorStop(0, '#e9edf3');
    g.addColorStop(0.45, '#9aa1ad');
    g.addColorStop(0.75, '#4a515c');
    g.addColorStop(1, '#23272e');
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = '#05070a'; ctx.stroke();
    const fg = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
    fg.addColorStop(0, '#171b21');
    fg.addColorStop(1, '#090c10');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fg; ctx.fill();
  }

  // Glass: a diagonal sheen over the dial face, clipped to the circle.
  function glass(cx, cy, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,0.13)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    g.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  function ticks(cx, cy, r) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11));
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
      ctx.strokeStyle = '#c8cdd8';
      ctx.stroke();
    }
  }

  // Numerals printed on the face (list of [value, text]); the needle sweeps
  // over them, the way a real gauge's needle does.
  function numbers(cx, cy, r, list, fontPx) {
    ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
    ctx.fillStyle = '#c8cdd8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach(([v, text]) => {
      const a = needleAngle(v);
      ctx.fillText(text, cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20));
    });
    ctx.textBaseline = 'alphabetic';
  }

  function redline(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, needleAngle(0.85), needleAngle(1));
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff5a4e';
    ctx.stroke();
  }

  function dial(cx, cy, r, label, value, color, nums, withRedline) {
    bezel(cx, cy, r);
    ticks(cx, cy, r);
    if (nums) numbers(cx, cy, r, nums.list, nums.fontPx);
    if (withRedline) redline(cx, cy, r);
    const a = needleAngle(value);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6);
    ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    const hg = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 6);
    hg.addColorStop(0, '#e9edf3');
    hg.addColorStop(1, '#5a6270');
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = hg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = '#0a0c0f'; ctx.stroke();
    glass(cx, cy, r);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#e8e4d8';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r + 18);
  }

  function update(state = {}) {
    const roll = state.roll ?? 0;
    const pitch = state.pitch ?? 0;
    // Panel face: near-black surround, then a machined metal slab with a
    // bevel — a top light edge and a bottom shadow edge, so the panel
    // reads as a solid slab instead of a painted card.
    ctx.fillStyle = '#0a0c0f';
    ctx.fillRect(0, 0, 640, 200);
    const face = ctx.createLinearGradient(0, 0, 0, 200);
    face.addColorStop(0, '#262b33');
    face.addColorStop(0.5, '#171a1f');
    face.addColorStop(1, '#0f1114');
    roundRectPath(6, 6, 628, 188, 12);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, 7); ctx.lineTo(620, 7);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 193); ctx.lineTo(620, 193);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    // Corner screws + placard.
    screw(20, 20); screw(620, 20); screw(20, 180); screw(620, 180);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#8a93a5';
    ctx.textAlign = 'center';
    ctx.fillText('E L A N G - 7', 320, 26);
    // Attitude indicator: the horizon rolls with the bank and shifts with
    // pitch, so it can never contradict the world outside the windscreen.
    bezel(320, 100, 56);
    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 100, 56, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(320, 100);
    ctx.rotate(-roll);
    ctx.translate(0, Math.max(-0.4, Math.min(0.4, pitch)) * 55);
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(-56, -56, 112, 56);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-56, 0, 112, 56);
    // Pitch ladder: short white ticks at ±10 deg, moving with the ball.
    ctx.strokeStyle = 'rgba(244,241,232,0.85)';
    ctx.lineWidth = 2;
    [-11, 11].forEach((dy) => {
      ctx.beginPath(); ctx.moveTo(-32, dy); ctx.lineTo(-10, dy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, dy); ctx.lineTo(32, dy); ctx.stroke();
    });
    ctx.strokeStyle = '#f4f1e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-52, 0);
    ctx.lineTo(52, 0);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol (does not roll): the reference that makes the
    // ball read as an attitude indicator instead of a painted circle.
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(320 - 26, 100); ctx.lineTo(320 - 8, 100); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(320 + 8, 100); ctx.lineTo(320 + 26, 100); ctx.stroke();
    ctx.beginPath(); ctx.arc(320, 100, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb020'; ctx.fill();
    // Bank pointer: small triangle at 12 o'clock on the bezel.
    ctx.beginPath();
    ctx.moveTo(320 - 6, 100 - 56 - 8);
    ctx.lineTo(320 + 6, 100 - 56 - 8);
    ctx.lineTo(320, 100 - 56 - 1);
    ctx.fillStyle = '#f4f1e8'; ctx.fill();
    glass(320, 100, 56);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#e8e4d8';
    ctx.textAlign = 'center';
    ctx.fillText('ATT', 320, 100 + 56 + 18);
    dial(140, 100, 56, 'KT', (state.speedKmh ?? 0) / 475, '#ffb020',
      { list: [[0, '0'], [0.25, '1'], [0.5, '2'], [0.75, '3'], [1, '4']], fontPx: 13 }, true);
    dial(500, 100, 56, 'ALT', (state.altM ?? 0) / 1500, '#7fe3f0',
      { list: [[0, '0'], [0.5, '8'], [1, '15']], fontPx: 13 }, false);
    dial(592, 100, 28, 'FUEL', state.fuel ?? 1, '#3ddc78',
      { list: [[0, 'E'], [0.5, '½'], [1, 'F']], fontPx: 11 }, false);
    dial(48, 100, 28, 'RPM', state.throttle ?? 0, '#ffb020', null, true);
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
