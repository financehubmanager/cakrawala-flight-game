// Input: keyboard plus mouse steering. The mouse steers by position —
// hold the pointer left or right of centre to bank, above or below to pitch —
// so no pointer lock is needed and the game works the moment it loads.
// Arrow keys / A,D do the same for keyboard-only players.
export function createInput(onAction) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false };
  const state = { pitch: 0, roll: 0, throttle: 0 };

  function keyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyC') onAction('camera');
    if (event.code === 'KeyP' || event.code === 'Escape') onAction('pause');
    if (event.code === 'KeyR') onAction('restart');
    if (event.code === 'KeyM') onAction('mute');
    if (event.code === 'KeyF') onAction('flaps');
    if (event.code === 'KeyG') onAction('gear');
    if (event.code === 'Space') {
      event.preventDefault();
      onAction('brake');
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function keyUp(event) {
    keys.delete(event.code);
  }

  function mouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
  }

  function mouseLeave() {
    mouse.active = false;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('mousemove', mouseMove);
  document.addEventListener('mouseleave', mouseLeave);

  function poll(dt) {
    // Throttle: W / Shift up, S / Ctrl down; keys nudge, mouse never touches it.
    let throttle = state.throttle;
    if (keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle += dt * 0.7;
    if (keys.has('KeyS') || keys.has('ControlLeft')) throttle -= dt * 0.9;
    state.throttle = Math.max(0, Math.min(1, throttle));
    // Pitch / roll: keyboard first, mouse position as a gentle second source.
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (mouse.active) {
      const dead = 0.12;
      const mx = Math.abs(mouse.x) > dead ? mouse.x : 0;
      const my = Math.abs(mouse.y) > dead ? mouse.y : 0;
      roll += mx * 0.85;
      pitch += -my * 0.7;
    }
    state.pitch = Math.max(-1, Math.min(1, pitch));
    state.roll = Math.max(-1, Math.min(1, roll));
    return { pitch: state.pitch, roll: state.roll, throttle: state.throttle };
  }

  function setThrottle(value) {
    state.throttle = Math.max(0, Math.min(1, value));
  }

  return { poll, setThrottle, keys, mouse };
}
