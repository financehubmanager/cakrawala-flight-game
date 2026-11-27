// Sky, sun, clouds and fog: one warm golden-hour look, with a dusk preset
// for the third mission. The dome is a painted gradient (cheaper and more
// art-directed than a physical sky model); the directional light is the sun.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { mulberry32 } from './rng.js';

export const TIMES_OF_DAY = {
  golden: {
    top: PALETTE.skyTop, mid: PALETTE.skyMid, low: PALETTE.skyLow,
    fog: PALETTE.fog, sunColor: 0xffd9a0, sunIntensity: 2.4,
    hemiSky: 0xffe0b3, hemiGround: 0x5d7a4a, hemiIntensity: 0.85,
    sunElevation: 0.32, sunAzimuth: 3.9, exposure: 1.12,
    fillColor: 0xffd9a0, fillIntensity: 0.55,
  },
  dusk: {
    top: PALETTE.duskTop, mid: PALETTE.duskMid, low: PALETTE.duskLow,
    fog: PALETTE.duskFog, sunColor: 0xff9a5e, sunIntensity: 1.9,
    hemiSky: 0x8a6a9e, hemiGround: 0x3a4a3a, hemiIntensity: 0.6,
    sunElevation: 0.1, sunAzimuth: 1.15, exposure: 1.05,
    fillColor: 0xff9a5e, fillIntensity: 0.35,
  },
};

function makeCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(99);
  for (let i = 0; i < 26; i += 1) {
    const x = 30 + rand() * 196;
    const y = 45 + rand() * 40;
    const r = 18 + rand() * 34;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,250,244,0.85)');
    grad.addColorStop(1, 'rgba(255,250,244,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSky(scene, renderer) {
  const domeGeo = new THREE.SphereGeometry(5200, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      low: { value: new THREE.Color(PALETTE.skyLow) },
      sunDir: { value: new THREE.Vector3(0.5, 0.3, 0.5).normalize() },
      sunColor: { value: new THREE.Color(0xffe9b8) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = h > 0.28
          ? mix(mid, top, smoothstep(0.28, 0.85, h))
          : mix(low, mid, smoothstep(-0.08, 0.28, h));
        float sunAmount = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 90.0);
        float halo = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 8.0);
        // v2: a wider, warmer glow around the sun so the sky has depth
        // instead of a flat disc on a flat gradient.
        col += sunColor * (sunAmount * 1.0 + halo * 0.32);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'skyDome';
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2600;
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x5d7a4a, 0.85);
  scene.add(hemi);

  // Warm fill from the south-east so the faces the camera sees (now backlit
  // by the north-west sun) don't go muddy. No shadows — it only lifts.
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.55);
  const fillDir = new THREE.Vector3(
    Math.cos(0.5) * Math.cos(0.85), Math.sin(0.5), Math.cos(0.5) * Math.sin(0.85),
  );
  scene.add(fill);
  scene.add(fill.target);

  // v2: fog starts closer (850 m) so distant ridges haze into layers —
  // aerial perspective the v1 700 m start barely showed.
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 850, 3400);

  // Cumulus: soft billboards drifting slowly, tinted by the sun.
  const tex = makeCloudTexture();
  const rand = mulberry32(4242);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 36; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.45 + rand() * 0.15, depthWrite: false,
    }));
    const x = (rand() - 0.5) * 7200;
    const z = (rand() - 0.5) * 7200;
    const y = 620 + rand() * 320;
    sprite.position.set(x, y, z);
    const s = 300 + rand() * 420;
    sprite.scale.set(s, s * 0.45, 1);
    sprite.userData.drift = 2 + rand() * 3;
    clouds.add(sprite);
  }
  // v2: a few big, low clouds near the horizon for layered distance.
  for (let i = 0; i < 8; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.3 + rand() * 0.1, depthWrite: false,
    }));
    const x = (rand() - 0.5) * 7200;
    const z = (rand() - 0.5) * 7200;
    const y = 420 + rand() * 140;
    sprite.position.set(x, y, z);
    const s = 520 + rand() * 260;
    sprite.scale.set(s, s * 0.4, 1);
    sprite.userData.drift = 1 + rand() * 2;
    clouds.add(sprite);
  }
  scene.add(clouds);

  function setTimeOfDay(name) {
    const t = TIMES_OF_DAY[name] || TIMES_OF_DAY.golden;
    domeMat.uniforms.top.value.set(t.top);
    domeMat.uniforms.mid.value.set(t.mid);
    domeMat.uniforms.low.value.set(t.low);
    const el = t.sunElevation;
    const az = t.sunAzimuth;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    domeMat.uniforms.sunDir.value.copy(dir);
    sun.color.set(t.sunColor);
    sun.intensity = t.sunIntensity;
    sun.position.copy(dir).multiplyScalar(1400);
    fill.color.set(t.fillColor);
    fill.intensity = t.fillIntensity;
    hemi.color.set(t.hemiSky);
    hemi.groundColor.set(t.hemiGround);
    hemi.intensity = t.hemiIntensity;
    scene.fog.color.set(t.fog);
    renderer.toneMappingExposure = t.exposure;
  }

  function update(dt, elapsed, focus) {
    // Clouds drift; the dome and the sun follow the aircraft so the sky
    // never ends, and the shadow frustum follows it too.
    clouds.children.forEach((c) => {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 3800) c.position.x = -3800;
    });
    dome.position.copy(focus);
    const dir = sun.position.clone().normalize();
    sun.position.copy(focus).addScaledVector(dir, 1400);
    sun.target.position.copy(focus);
    fill.position.copy(focus).addScaledVector(fillDir, 1400);
    fill.target.position.copy(focus);
  }

  setTimeOfDay('golden');
  return { setTimeOfDay, update, sun };
}
