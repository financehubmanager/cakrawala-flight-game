// Deterministic screenshot states: `?shot=<name>&seed=1` puts the game in a
// fixed, photogenic moment — same mission, same aircraft pose, same camera —
// so the screenshots are real renders of the game's own code, reproducible
// every run, and the critic loop compares like with like.
//   cover   — chase view, low over the lagoon toward the volcano, ring ahead
//   crash   — the wrecked Elang-7 on the ridge slope, crash banner + HUD
//   cockpit — cockpit view, lit panel, ring and runway ahead
//   landing — touchdown, gear down, runway lights ahead, dusk light
import { heightAt } from './terrain.js';

export const SHOTS = [
  { name: '1-cover.jpg', query: '?shot=cover&seed=1' },
  { name: '2-crash.jpg', query: '?shot=crash&seed=1' },
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
        // v2: low pass down the runway centreline, facing north — the strip
        // fills the lower frame, ring 1 sits dead ahead over it, the volcano
        // looms beyond. Runway AND ring in one frame (v1 showed no runway).
        // 14 m east of the centreline so the strip shows beside the plane
        // instead of hiding under it.
        aircraft: { x: 344, y: ground(344, 1120) + 76, z: 1120, heading: 0, pitch: 0.0, roll: -0.08, speed: 96, throttle: 0.75, fuel: 0.86, vspeed: 0, onGround: false, gearDown: false },
        ringsPassed: 0, elapsed: 30,
      };
    case 'crash':
      return {
        missionId: 'ridge-courier', camera: 'chase', timeOfDay: 'golden',
        // v5: CRASH, not mid-flight — the wrecked Elang-7 on the valley
        // floor between ring 3 (-180,-40) and ring 4 (-480,-260), nose
        // down and banked onto a wing after the third hard impact
        // (RUSAK 3/3, fuel 0.09 = LOW). The valley floor here is nearly
        // flat (slope ~0.05, terraced green), so the wreck rests visibly
        // ON the ground — wheels touching, low wingtip dug into the
        // terrace — instead of floating against a steep slope (the first
        // ridge site at (-900,-600) read as a steep bank in the air).
        // Ring 4 glows ahead: the sortie was chasing it when it went in.
        // v5.2: pose + camera tuned after two shoots read as "banking in
        // the air" — the chase cam was too far/high to show ground
        // contact, and SPD 0 at ALT 97 m read as frozen physics. Now the
        // camera is closer/lower (10 m, 3.2 m) and the wreck is more
        // wrecked (roll 0.75, pitch -0.35, y = ground + 2): the low
        // wingtip digs into the terrace, the wheels touch, the nose sits
        // just above the grass.
        aircraft: { x: -400, y: ground(-400, -200) + 2, z: -200, heading: 0.94, pitch: -0.35, roll: 0.75, speed: 0, throttle: 0, fuel: 0.09, vspeed: 0, onGround: true, gearDown: false, hits: 3 },
        ringsPassed: 3, elapsed: 96,
        crashed: true, crashReason: 'Menabrak tanah — pesawat hancur.',
        cameraDist: 10, cameraHeight: 3.2,
      };
    case 'cockpit':
      return {
        missionId: 'ring-run', camera: 'cockpit', timeOfDay: 'golden',
        // v2: LEVEL flight (roll 0, pitch 0) on the runway centreline, heading
        // north — the ATT horizon and the world horizon agree, so nothing
        // reads as a bug; the compass centres on N 000, so no half-label.
        // Ring 1 and the strip share the windscreen with the volcano.
        aircraft: { x: 330, y: ground(330, 1180) + 83, z: 1180, heading: 0, pitch: 0.0, roll: 0, speed: 92, throttle: 0.7, fuel: 0.82, vspeed: 0, onGround: false, gearDown: false },
        ringsPassed: 0, elapsed: 30,
      };
    case 'landing':
      return {
        missionId: 'ridge-courier', camera: 'chase', timeOfDay: 'dusk',
        // v4: TOUCHDOWN, not approach — wheels on the strip 20 m past the
        // threshold (groundY 12 + 3 = 15 m), flare nose-up, gentle sink.
        // The strip fills the lower frame and runs 600 m ahead; the
        // threshold bars sit under the nose; all 12 rings passed, so the
        // objective reads as landing (see applyShot in main.js).
        aircraft: { x: 330, y: 15, z: 1040, heading: 0, pitch: 0.06, roll: 0, speed: 55, throttle: 0.25, fuel: 0.3, vspeed: -1.5, onGround: true, gearDown: true, flaps: true },
        ringsPassed: 12, elapsed: 218,
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
