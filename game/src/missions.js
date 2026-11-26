// Missions: three sorties with different goals over the same island, each
// with its own ring course, time limit, fuel load, wind and time of day.
// Ring courses are laid out over named landmarks so every mission reads as a
// different flight, not the same loop with more rings.
import { MISSIONS, WORLD } from './config.js';
import { courseFor } from './rings.js';

const VOLCANO = WORLD.volcano;
const RUNWAY = WORLD.runway;

function missionCourses() {
  return {
    'ring-run': courseFor(null, [
      { x: 330, z: 620, radius: 26, clearance: 60 },
      { x: 120, z: 180, radius: 26, clearance: 70 },
      { x: -260, z: -120, radius: 24, clearance: 80 },
      // Ring 4 raised (90 -> 140) and ring 5 lowered (110 -> 60): the
      // 4 -> 5 leg climbed 30.8 deg, past the 20.5 deg limit; now ~12 deg.
      { x: -620, z: -380, radius: 24, clearance: 140 },
      { x: -820, z: -560, radius: 26, clearance: 65 },
      { x: -420, z: -820, radius: 24, clearance: 80 },
      { x: 40, z: -620, radius: 26, clearance: 70 },
      { x: 330, z: -120, radius: 28, clearance: 60 },
    ]),
    'ridge-courier': courseFor(null, [
      // Rings 1-2 raised (55/60 -> 70/75): the leg dipped to 33 m clearance.
      { x: 330, z: 620, radius: 24, clearance: 70 },
      { x: 60, z: 240, radius: 24, clearance: 75 },
      { x: -180, z: -40, radius: 22, clearance: 65 },
      // Ring 4 raised (75 -> 100), ring 5 raised (100 -> 120), ring 6
      // lowered (130 -> 100), ring 7 raised (90 -> 115): the 5 -> 6 leg
      // climbed 25.2 deg and the 6 -> 7 line sagged toward the ridge.
      { x: -480, z: -260, radius: 22, clearance: 100 },
      { x: -780, z: -480, radius: 24, clearance: 120 },
      { x: -1050, z: -760, radius: 26, clearance: 100 },
      { x: -760, z: -1020, radius: 24, clearance: 115 },
      { x: -320, z: -980, radius: 22, clearance: 70 },
      { x: 120, z: -780, radius: 24, clearance: 70 },
      { x: 380, z: -420, radius: 24, clearance: 60 },
      // Rings 11-12 raised (55 -> 110/100): the final leg dipped below the
      // hills between the coast and the strip.
      { x: 480, z: -40, radius: 24, clearance: 110 },
      { x: 330, z: 420, radius: 26, clearance: 100 },
    ]),
    'volcano-dash': courseFor(null, [
      // Rings 1-2 raised (60/70 -> 80/90): the leg dipped to 24 m clearance.
      { x: 330, z: 620, radius: 24, clearance: 80 },
      { x: -120, z: 120, radius: 24, clearance: 90 },
      // Ring 3 raised (85 -> 115), ring 4 lowered (120 -> 100), ring 5
      // raised (140 -> 150): the 3 -> 4 leg climbed 24.9 deg, past the
      // 20.5 deg limit; now ~19 deg, and the 4 -> 5 line keeps 40 m clear.
      { x: -560, z: -240, radius: 22, clearance: 115 },
      { x: -880, z: -520, radius: 24, clearance: 100 },
      { x: -1180, z: -780, radius: 26, clearance: 155 },
      { x: -980, z: -1060, radius: 24, clearance: 110 },
      { x: -640, z: -1080, radius: 22, clearance: 90 },
      { x: -420, z: -820, radius: 24, clearance: 85 },
      { x: -160, z: -560, radius: 24, clearance: 70 },
      { x: 240, z: -320, radius: 26, clearance: 60 },
    ]),
  };
}

export const COURSES = missionCourses();

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

export function spawnFor(missionId) {
  // On the runway, south threshold, facing north down the strip, ready to roll.
  return {
    x: RUNWAY.x, y: RUNWAY.groundY + 3, z: RUNWAY.z + RUNWAY.length / 2 - 40,
    heading: 0, speed: 0, throttle: 0, fuel: missionById(missionId).fuel,
    gearDown: true, onGround: true,
  };
}

// Score: rings are worth 100 each, a soft landing up to 250, leftover fuel
// up to 150, and a time bonus against the mission's par. Crashes score 0.
export function scoreRun({ ringsPassed, ringCount, landingSoftness, fuelLeft, elapsed, par }) {
  const ringScore = ringsPassed * 100;
  const landingScore = Math.round(landingSoftness * 250);
  const fuelScore = Math.round(fuelLeft * 150);
  const timeBonus = Math.max(0, Math.round((par - elapsed) * 2));
  return {
    ringScore, landingScore, fuelScore, timeBonus,
    total: ringScore + landingScore + fuelScore + timeBonus,
    ringsPassed, ringCount,
  };
}
