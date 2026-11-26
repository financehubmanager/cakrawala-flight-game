// Every tuning number and colour in one place, so the whole game can be
// re-balanced without touching the systems that use them.
export const WORLD = {
  size: 4200, // terrain spans -2100..2100 in x and z
  seaLevel: 0,
  volcano: { x: -950, z: -750, radius: 720, height: 430 },
  // The coast: terrain sinks below the sea east of this line.
  coastX: 520,
  coastBlend: 320,
  // Coastal airstrip: flat ground, runway pointing north (-z).
  runway: { x: 330, z: 750, length: 620, width: 34, heading: 0, groundY: 12 },
};

export const PLANE = {
  maxSpeed: 132, // m/s at full throttle (~475 km/h)
  minSpeed: 38, // m/s at idle
  stallSpeed: 52, // below this the nose drops and the stall horn sounds
  cruiseSpeed: 84,
  accel: 26, // m/s^2 toward the throttle's target speed
  maxRoll: 1.05, // radians of bank
  maxPitch: 0.42, // radians up/down
  rollRate: 2.4, // rad/s toward the target bank
  pitchRate: 1.9, // rad/s toward the target pitch
  turnFactor: 0.55, // heading change per radian of bank, scaled by speed
  dragOnClimb: 0.32, // energy lost climbing, regained diving
  fuelBurn: 0.011, // fraction of tank per second at full throttle
  fuelBurnIdle: 0.0035,
  hitsToCrash: 3,
  landingMaxSink: 8, // m/s averaged sink allowed for a touchdown
  landingMaxSpeed: 72, // m/s allowed for a touchdown
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Misi 1 — Ring Run',
    brief: 'Terbang melewati 8 cincin, lalu kembali dan mendarat di landasan.',
    rings: 8,
    timeLimit: 240,
    fuel: 1.0,
    wind: 0,
    timeOfDay: 'golden',
    scorePar: 150,
  },
  {
    id: 'ridge-courier',
    name: 'Misi 2 — Ridge Courier',
    brief: '12 cincin menyusuri lembah dan mengelilingi gunung berapi, lalu mendarat.',
    rings: 12,
    timeLimit: 330,
    fuel: 1.0,
    wind: 2.5,
    timeOfDay: 'golden',
    scorePar: 210,
  },
  {
    id: 'volcano-dash',
    name: 'Misi 3 — Volcano Dash',
    brief: 'Senja. Cincin mengelilingi kawah berasap, bahan bakar ketat, angin kencang.',
    rings: 10,
    timeLimit: 260,
    fuel: 0.62,
    wind: 6,
    timeOfDay: 'dusk',
    scorePar: 260,
  },
];

export const PALETTE = {
  skyTop: '#9c8bb8',
  skyMid: '#f6c98f',
  skyLow: '#f2a56b',
  duskTop: '#3a3f6e',
  duskMid: '#c65f6e',
  duskLow: '#e08a4e',
  sun: '#ffd9a0',
  fog: '#e8b98a',
  duskFog: '#8a5a6e',
  sea: '#2e8fa3',
  seaDeep: '#1d6d84',
  sand: '#d9c08a',
  grassA: '#7fae4e',
  grassB: '#5d9240',
  terraceA: '#8fbf5a',
  terraceB: '#6da344',
  rock: '#8a7a6a',
  basalt: '#4a4442',
  crater: '#6e625c',
  planeOrange: '#e86a1c',
  planeCream: '#f4e8d2',
  planeDark: '#33302e',
  ring: '#ffb020',
  ringNext: '#ffcf5e',
  runway: '#3a3f46',
  hudAmber: '#ffb020',
  hudCyan: '#7fe3f0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
