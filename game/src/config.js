// config.js — every tuning constant for Emberpass Airlift in one place.
// World axes: +x east, +z south, +y up. Heading 0 faces north (-z), and
// headings grow clockwise (compass style), so heading h points along
// (sin h, -cos h) in the x/z plane. Distances are metres, speeds m/s.

export const WORLD = {
  size: 9000,            // the valley is a 9 km square, centred on the strip
  seaLevel: 0,
  valleyFloor: 0,        // height of the flat valley floor the strip sits on
  stripLength: 950,      // runway 17/35 at Emberpass, metres
  stripWidth: 42,
  stripCenter: { x: 0, z: 0 },
  camp: { x: 1450, z: -2350 },  // Ember Camp, east of the north ridge gap
};

export const PLANE = {
  mass: 1150,            // kg, a loaded bush plane
  maxThrust: 5200,       // N at full throttle, sea level
  wingArea: 16.2,        // m^2
  stallSpeed: 26,        // m/s, below this the wing stops holding the nose up
  cruiseSpeed: 48,
  maxSpeed: 78,          // structural, the airframe shakes past it
  fuelCapacity: 118,     // litres
  fuelBurnFull: 0.055,   // litres per second at full throttle
  rollRate: 1.9,         // rad/s of bank change at full aileron
  pitchRate: 0.85,       // rad/s of pitch change at full elevator
  maxBank: 1.15,         // rad, about 66 degrees
  maxPitch: 0.5,         // rad up
  minPitch: -0.62,       // rad down
};

export const VIEW = {
  width: 1280,
  height: 800,
  fovY: 1.08,            // rad, vertical field of view
  near: 0.6,
  far: 6500,
  terrainRadius: 2600,   // draw terrain tiles out to this range
  fogStart: 1500,
  fogEnd: 5200,
};

// Dusk over the pass: one warm palette for sky, ground and light, used by
// every file that paints so the whole game reads in a single style.
export const PALETTE = {
  skyTop: [38, 52, 96],
  skyHorizon: [238, 148, 92],
  skyLow: [250, 196, 130],
  fog: [232, 158, 108],
  sun: [255, 214, 150],
  grassLow: [74, 104, 62],
  grassHigh: [104, 128, 74],
  dryGrass: [150, 138, 84],
  rock: [110, 96, 92],
  rockDark: [78, 70, 72],
  snow: [236, 232, 226],
  river: [64, 110, 138],
  riverBank: [126, 116, 88],
  pineTrunk: [84, 62, 44],
  pineTop: [38, 74, 50],
  strip: [52, 52, 58],
  stripMark: [232, 230, 222],
  stripEdge: [255, 176, 66],
  planeBody: [238, 232, 218],
  planeTrim: [224, 110, 44],
  planeDark: [40, 42, 50],
  ringNext: [255, 176, 66],
  ringDone: [96, 200, 140],
  ringIdle: [150, 170, 200],
  targetZone: [255, 92, 66],
  ember: [255, 110, 40],
};

export const SORTIE_COUNT = 3;
