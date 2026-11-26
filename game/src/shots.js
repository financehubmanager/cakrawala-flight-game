// Deterministic screenshot states: `?shot=<name>&seed=1` puts the game in a
// fixed, photogenic moment — same mission, same aircraft pose, same camera —
// so the screenshots are real renders of the game's own code, reproducible
// every run, and the critic loop compares like with like.
//   cover   — chase view, low over the lagoon toward the volcano, ring ahead
//   play    — mid-flight ring pass, wings banked, terraces below
//   cockpit — cockpit view, lit panel, ring and runway ahead
//   landing — final approach, gear down, runway lights ahead, dusk light
import { heightAt } from './terrain.js';

export const SHOTS = [
  { name: '1-cover.jpg', query: '?shot=cover&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-cockpit.jpg', query: '?shot=cockpit&seed=1' },
  { name: '4-landing.jpg', query: '?shot=landing&seed=1' },
];

// Each shot is a full game state: mission, aircraft pose, camera, time of day.
// Altitudes clear the ground beneath them (heightAt + margin).
export function shotState(name) {
  const ground = (x, z) => heightAt(x, z);
  switch (name) {
    case 'cover':
      return {
        missionId: 'ring-run', camera: 'chase', timeOfDay: 'golden',
        aircraft: { x: 420, y: ground(420, 620) + 100, z: 620, heading: 0.6, pitch: 0.02, roll: -0.18, speed: 96, throttle: 0.72, fuel: 0.86, vspeed: 1.8, onGround: false },
        ringsPassed: 1, elapsed: 38,
      };
    case 'play':
      return {
        missionId: 'ridge-courier', camera: 'chase', timeOfDay: 'golden',
        // 160 m before ring 4 on the ring 3 -> ring 4 leg, so the gate sits
        // ahead in frame instead of swallowing the camera.
        aircraft: { x: -351, y: ground(-351, -165) + 95, z: -165, heading: 0.94, pitch: -0.02, roll: 0.45, speed: 104, throttle: 0.8, fuel: 0.7, vspeed: -0.6, onGround: false },
        ringsPassed: 3, elapsed: 74,
      };
    case 'cockpit':
      return {
        missionId: 'ring-run', camera: 'cockpit', timeOfDay: 'golden',
        // ~120 m behind ring 2 on the approach leg, so the gate, the
        // volcano and the panel all share the frame.
        aircraft: { x: 214, y: ground(214, 254) + 110, z: 254, heading: 0.9, pitch: 0.0, roll: 0.1, speed: 92, throttle: 0.7, fuel: 0.82, vspeed: 0.9, onGround: false },
        ringsPassed: 1, elapsed: 46,
      };
    case 'landing':
      return {
        missionId: 'ridge-courier', camera: 'chase', timeOfDay: 'dusk',
        // ~150 m before the threshold at 60 m: the strip and its threshold
        // fill the lower half instead of empty green.
        aircraft: { x: 330, y: 60, z: 1210, heading: 0, pitch: -0.12, roll: 0, speed: 62, throttle: 0.3, fuel: 0.3, vspeed: -4.0, onGround: false, gearDown: true, flaps: true },
        ringsPassed: 11, elapsed: 218,
      };
    default:
      return null;
  }
}

export function parseShot(search) {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  if (!shot) return null;
  return shotState(shot);
}
