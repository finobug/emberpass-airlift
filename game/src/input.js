// input.js — keyboard and mouse, read as one snapshot per frame. Arrows or
// WASD fly, Shift and Ctrl work the throttle, Space is the brake (and air
// brake), F releases the crate, C swaps chase and cockpit, P pauses.

const held = new Set();
const pressed = new Set();
let mouseSteer = null;   // {pitch, roll} while the mouse button is held

export function initInput(canvas) {
  const gameKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyC', 'KeyP', 'KeyR',
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Enter',
  ]);
  addEventListener('keydown', (e) => {
    if (gameKeys.has(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); mouseSteer = null; });
  canvas.addEventListener('mousedown', (e) => {
    mouseSteer = steerFromEvent(e, canvas);
  });
  addEventListener('mousemove', (e) => {
    if (mouseSteer) mouseSteer = steerFromEvent(e, canvas);
  });
  addEventListener('mouseup', () => { mouseSteer = null; });
}

function steerFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  return { roll: clampUnit(nx * 1.4), pitch: clampUnit(-ny * 1.2) };
}

function clampUnit(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

function axis(negCodes, posCodes) {
  let v = 0;
  for (const c of posCodes) if (held.has(c)) v += 1;
  for (const c of negCodes) if (held.has(c)) v -= 1;
  return clampUnit(v);
}

// One frame of intent. `pressed` edges are consumed by the first reader.
export function readInput() {
  const out = {
    pitch: axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']),
    roll: axis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']),
    throttleDelta: axis(['ControlLeft', 'ControlRight'], ['ShiftLeft', 'ShiftRight']),
    brake: held.has('Space'),
    drop: pressed.has('KeyF'),
    camera: pressed.has('KeyC'),
    pause: pressed.has('KeyP'),
    confirm: pressed.has('Enter'),
    restart: pressed.has('KeyR'),
  };
  if (mouseSteer) {
    out.pitch = mouseSteer.pitch;
    out.roll = mouseSteer.roll;
  }
  pressed.clear();
  return out;
}
