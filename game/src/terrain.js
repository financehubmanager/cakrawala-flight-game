// The island: one height function shared by the visible mesh, the flight
// model (ground collision), the ring placement and the trees, so what you see
// is exactly what you can hit. Terrain is a volcanic island: a smoking cone in
// the north-west, terraced green hills in the middle, a turquoise sea and a
// coastal airstrip in the east.
import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { fbm2, clamp, lerp, smoothstep } from './rng.js';

const SEED = 20261126;
const VOLCANO = WORLD.volcano;
const RUNWAY = WORLD.runway;

// The one height function. Pure: same (x, z) always gives the same height.
export function heightAt(x, z) {
  // Rolling hills, strongest in the middle of the island.
  const hills = fbm2(x * 0.0009 + 7.3, z * 0.0009 + 2.9, SEED) * 95 + 55;
  // A long ridge running north-south through the centre.
  const ridge = Math.max(0, 1 - Math.abs(x + 250) / 900) * 70
    * (0.5 + 0.5 * fbm2(x * 0.0016, z * 0.0016 + 11, SEED + 5));
  let h = hills + ridge;
  // The volcano cone, with a crater dip at its centre.
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const distV = Math.sqrt(dx * dx + dz * dz);
  const cone = Math.max(0, 1 - distV / VOLCANO.radius);
  h += cone * cone * VOLCANO.height;
  if (distV < 150) h -= (1 - distV / 150) * 90; // crater bowl
  // The coast: ground sinks below the sea east of coastX.
  const coast = smoothstep(WORLD.coastX, WORLD.coastX + WORLD.coastBlend, x);
  h = lerp(h, -18, coast);
  // Flatten the airstrip: a rectangle around the runway, blended at its edges.
  const rx = Math.abs(x - RUNWAY.x);
  const rz = Math.abs(z - RUNWAY.z);
  const inStrip = smoothstep(RUNWAY.width / 2 + 130, RUNWAY.width / 2 + 20, rx)
    * smoothstep(RUNWAY.length / 2 + 130, RUNWAY.length / 2 + 20, rz);
  h = lerp(h, RUNWAY.groundY, inStrip);
  return h;
}

function terrainColor(x, z, h, slope) {
  const c = new THREE.Color();
  const n = fbm2(x * 0.004 + 3, z * 0.004 + 8, SEED + 31) * 0.5 + 0.5;
  if (h < 2.5) {
    c.set(PALETTE.sand);
  } else if (h < 170 && slope < 0.55) {
    // Rice terraces: height is banded into steps, alternating two greens.
    // v2: 24 m bands (the mesh's vertices sit ~23 m apart, so the v1 7 m
    // bands aliased away and the hills read as flat green) with a stronger
    // light/dark contrast between steps.
    const band = Math.floor(h / 24) % 2 === 0 ? PALETTE.terraceA : PALETTE.terraceB;
    c.set(band);
    c.offsetHSL(0, 0, (n - 0.5) * 0.06);
  } else if (h < 170) {
    c.set(PALETTE.grassB);
  } else if (h < 300) {
    c.set(PALETTE.rock);
  } else {
    c.set(PALETTE.basalt);
  }
  // Dark basalt near the volcano, grey inside the crater.
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const distV = Math.sqrt(dx * dx + dz * dz);
  if (distV < VOLCANO.radius * 0.75) {
    c.lerp(new THREE.Color(PALETTE.basalt), smoothstep(VOLCANO.radius * 0.75, VOLCANO.radius * 0.3, distV) * 0.8);
  }
  if (distV < 150) c.set(PALETTE.crater);
  if (slope > 0.62) c.lerp(new THREE.Color(PALETTE.rock), 0.6);
  return c;
}

export function buildTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'terrain';

  const segments = 180;
  const size = WORLD.size;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    // Slope from a small finite difference, for colouring only.
    const slope = Math.abs(heightAt(x + 6, z) - h) / 6 + Math.abs(heightAt(x, z + 6) - h) / 6;
    color.copy(terrainColor(x, z, h, slope));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
  );
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // The sea: a flat plane at sea level, glossy teal, catching the sun.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.2, size * 2.2),
    new THREE.MeshPhongMaterial({
      color: PALETTE.sea, specular: 0xffd9a0, shininess: 140,
      transparent: true, opacity: 0.92,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  sea.name = 'sea';
  group.add(sea);

  // A shallow turquoise lagoon off the east coast: a lighter patch on the
  // sea, so the water reads as a bay, not a flat sheet.
  const lagoon = new THREE.Mesh(
    new THREE.CircleGeometry(260, 40),
    new THREE.MeshPhongMaterial({
      color: 0x54b8c9, specular: 0xffe9b8, shininess: 160,
      transparent: true, opacity: 0.85,
    }),
  );
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(900, WORLD.seaLevel + 0.6, 300);
  lagoon.name = 'lagoon';
  group.add(lagoon);

  // Distant islands on the horizon: low dark cones in the sea, so the
  // horizon has layered depth instead of an empty gradient.
  const islandMat = new THREE.MeshStandardMaterial({ color: PALETTE.basalt, roughness: 1, flatShading: true });
  [[1500, -900, 260, 70], [1750, 300, 210, 52], [1250, 1500, 180, 42]].forEach(([x, z, r, h]) => {
    const island = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), islandMat);
    island.position.set(x, h / 2 - 22, z);
    island.name = 'island';
    group.add(island);
  });

  // Terraced hills get trees: instanced cones + trunks, only where the ground
  // is grassy, gentle and clear of the runway and the volcano.
  const treeSpots = [];
  const rand = (s) => {
    const v = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < 9000; i += 1) {
    const x = (rand(i) - 0.5) * (size - 200);
    const z = (rand(i + 50000) - 0.5) * (size - 200);
    const h = heightAt(x, z);
    const slope = Math.abs(heightAt(x + 6, z) - h) / 6;
    const nearRunway = Math.abs(x - RUNWAY.x) < 160 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 160;
    const nearVolcano = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.55;
    if (h > 14 && h < 175 && slope < 0.35 && !nearRunway && !nearVolcano && rand(i + 999) < 0.16) {
      treeSpots.push({ x, z, h, s: 0.7 + rand(i + 7) * 0.9 });
    }
    if (treeSpots.length >= 850) break;
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(4.2, 11, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7d33, roughness: 1, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const crownTint = new THREE.Color();
  treeSpots.forEach((t, i) => {
    sc.set(t.s, t.s, t.s);
    m.compose(new THREE.Vector3(t.x, t.h + 2.2 * t.s, t.z), q, sc);
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.x, t.h + (5 + 5) * t.s, t.z), q, sc);
    crowns.setMatrixAt(i, m);
    // Per-tree tint so the forest is not one flat green.
    crownTint.setHSL(0.29 + rand(i + 21) * 0.04, 0.5, 0.32 + rand(i + 55) * 0.12);
    crowns.setColorAt(i, crownTint);
  });
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // Broadleaf trees: round crowns in the valleys and near the coast, so the
  // forest is not 850 identical cones. Same seeded placement, second type.
  const broadSpots = [];
  for (let i = 0; i < 6000 && broadSpots.length < 180; i += 1) {
    const x = (rand(i + 70000) - 0.5) * (size - 200);
    const z = (rand(i + 120000) - 0.5) * (size - 200);
    const h = heightAt(x, z);
    const slope = Math.abs(heightAt(x + 6, z) - h) / 6;
    const nearRunway = Math.abs(x - RUNWAY.x) < 160 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 160;
    const nearVolcano = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.55;
    if (h > 14 && h < 120 && slope < 0.3 && !nearRunway && !nearVolcano && rand(i + 31337) < 0.25) {
      broadSpots.push({ x, z, h, s: 0.8 + rand(i + 3) * 0.8 });
    }
  }
  const broadTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broadSpots.length);
  const broadCrownGeo = new THREE.SphereGeometry(4.6, 7, 5);
  const broadCrownMat = new THREE.MeshStandardMaterial({ color: 0x4a7d3a, roughness: 1, flatShading: true });
  const broadCrowns = new THREE.InstancedMesh(broadCrownGeo, broadCrownMat, broadSpots.length);
  broadSpots.forEach((t, i) => {
    sc.set(t.s, t.s, t.s);
    m.compose(new THREE.Vector3(t.x, t.h + 2.2 * t.s, t.z), q, sc);
    broadTrunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.x, t.h + 9 * t.s, t.z), q, new THREE.Vector3(t.s, t.s * 0.75, t.s));
    broadCrowns.setMatrixAt(i, m);
    crownTint.setHSL(0.26 + rand(i + 91) * 0.05, 0.48, 0.3 + rand(i + 17) * 0.12);
    broadCrowns.setColorAt(i, crownTint);
  });
  if (broadCrowns.instanceColor) broadCrowns.instanceColor.needsUpdate = true;
  broadTrunks.castShadow = true;
  broadCrowns.castShadow = true;
  group.add(broadTrunks);
  group.add(broadCrowns);

  // The runway: dark strip, white threshold bars, edge lights, windsock.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshStandardMaterial({ color: PALETTE.runway, roughness: 0.9 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, RUNWAY.groundY + 0.4, RUNWAY.z);
  strip.receiveShadow = true;
  strip.name = 'runway';
  group.add(strip);
  const markMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e8 });
  [-RUNWAY.length / 2 + 26, RUNWAY.length / 2 - 26].forEach((dz) => {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 14), markMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(RUNWAY.x + k * 5.4, RUNWAY.groundY + 0.5, RUNWAY.z + dz);
      group.add(bar);
    }
  });
  const lightGeo = new THREE.SphereGeometry(0.9, 6, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc861 });
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, 44);
  let li = 0;
  for (let k = 0; k < 22; k += 1) {
    const dz = -RUNWAY.length / 2 + 20 + (k * (RUNWAY.length - 40)) / 21;
    [-RUNWAY.width / 2 - 2, RUNWAY.width / 2 + 2].forEach((dx) => {
      m.compose(new THREE.Vector3(RUNWAY.x + dx, RUNWAY.groundY + 1.2, RUNWAY.z + dz), q, new THREE.Vector3(1, 1, 1));
      lights.setMatrixAt(li, m);
      li += 1;
    });
  }
  group.add(lights);
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 14, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
  );
  sockPole.position.set(RUNWAY.x + 42, RUNWAY.groundY + 7, RUNWAY.z - RUNWAY.length / 2 + 60);
  group.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 9, 8),
    new THREE.MeshStandardMaterial({ color: 0xe86a1c, roughness: 0.8 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.x + 46, RUNWAY.groundY + 13.4, RUNWAY.z - RUNWAY.length / 2 + 60);
  sock.name = 'windsock';
  group.add(sock);

  // Volcano smoke: a rising column of soft billboards, animated in main.js.
  const smokeCount = 26;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(smokeCount * 3);
  for (let i = 0; i < smokeCount; i += 1) {
    smokePos[i * 3] = VOLCANO.x + (rand(i + 31) - 0.5) * 60;
    smokePos[i * 3 + 1] = heightAt(VOLCANO.x, VOLCANO.z) + 30 + i * 14;
    smokePos[i * 3 + 2] = VOLCANO.z + (rand(i + 77) - 0.5) * 60;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  // Soft round puffs: without an alpha map Points render as hard squares.
  const puffCanvas = document.createElement('canvas');
  puffCanvas.width = 64;
  puffCanvas.height = 64;
  const puffCtx = puffCanvas.getContext('2d');
  const puffGrad = puffCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  puffGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
  puffGrad.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  puffGrad.addColorStop(1, 'rgba(255,255,255,0)');
  puffCtx.fillStyle = puffGrad;
  puffCtx.fillRect(0, 0, 64, 64);
  const puffTex = new THREE.CanvasTexture(puffCanvas);
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    color: 0xcfc8c2, size: 44, transparent: true, opacity: 0.6, sizeAttenuation: true,
    map: puffTex, alphaTest: 0.01, depthWrite: false,
  }));
  smoke.name = 'smoke';
  group.add(smoke);

  scene.add(group);
  return { group, windsock: sock, smoke };
}

export function isOverRunway(x, z) {
  return Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 6
    && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 6;
}

export function isOverWater(x, z) {
  return heightAt(x, z) < WORLD.seaLevel + 0.5;
}
