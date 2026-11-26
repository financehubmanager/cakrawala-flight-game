// Mission rings: glowing torus gates the pilot flies through in sequence.
// A ring is passed when the aircraft crosses its plane within its radius;
// the next ring lights up and the passed one turns green and fades.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { heightAt } from './terrain.js';

export function buildRings(scene, points) {
  const group = new THREE.Group();
  group.name = 'rings';
  const rings = points.map((p, index) => {
    const ringGroup = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(p.radius, 1.1, 10, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring, transparent: true, opacity: 0.95 }),
    );
    ringGroup.add(torus);
    // A faint disc so the gate reads at distance, and a beacon light above.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.radius - 1, 32),
      new THREE.MeshBasicMaterial({
        color: PALETTE.ring, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ringGroup.add(disc);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8 }),
    );
    beacon.position.y = p.radius + 6;
    ringGroup.add(beacon);
    ringGroup.position.set(p.x, p.y, p.z);
    // Face the ring toward the previous point (or north for the first).
    const from = index === 0 ? { x: p.x, z: p.z + 200 } : points[index - 1];
    ringGroup.lookAt(from.x, p.y, from.z);
    ringGroup.userData.index = index;
    ringGroup.userData.passed = false;
    ringGroup.userData.prevSide = null;
    group.add(ringGroup);
    return { group: ringGroup, torus, disc, beacon, point: p };
  });
  scene.add(group);
  return { group, rings };
}

export function ringAltitude(x, z, clearance) {
  return Math.max(heightAt(x, z) + clearance, 60);
}

// Lay out a mission's ring course: waypoints over named landmarks, with
// altitudes that clear the ground beneath each ring.
export function courseFor(mission, seedPoints) {
  return seedPoints.map((p) => ({
    ...p,
    y: ringAltitude(p.x, p.z, p.clearance ?? 55),
  }));
}

export function updateRings(rings, aircraftPos, currentIndex, elapsed) {
  let passedIndex = -1;
  rings.forEach((ring, i) => {
    const isNext = i === currentIndex;
    const isPassed = ring.group.userData.passed;
    const pulse = 1 + Math.sin(elapsed * 3 + i) * 0.04;
    ring.group.scale.setScalar(pulse);
    if (isPassed) {
      ring.torus.material.color.set(0x3ddc78);
      ring.torus.material.opacity = 0.35;
      ring.disc.material.opacity = 0.02;
      ring.beacon.visible = false;
    } else if (isNext) {
      ring.torus.material.color.set(PALETTE.ringNext);
      ring.torus.material.opacity = 1;
      ring.disc.material.opacity = 0.12;
      ring.beacon.visible = true;
    } else {
      ring.torus.material.color.set(PALETTE.ring);
      ring.torus.material.opacity = 0.55;
      ring.disc.material.opacity = 0.05;
      ring.beacon.visible = false;
    }
    if (isNext && !isPassed) {
      // Crossing test: signed distance to the ring plane, from the ring's
      // forward axis, flipping sign as the aircraft passes through.
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.group.quaternion);
      const toPlane = new THREE.Vector3().subVectors(aircraftPos, ring.group.position);
      const side = Math.sign(toPlane.dot(normal)) || 1;
      const prev = ring.group.userData.prevSide;
      ring.group.userData.prevSide = side;
      if (prev !== null && prev !== side) {
        const lateral = toPlane.clone().addScaledVector(normal, -toPlane.dot(normal));
        if (lateral.length() < ring.point.radius) passedIndex = i;
      }
    }
  });
  return passedIndex;
}
