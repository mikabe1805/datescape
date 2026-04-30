import { useEffect, useRef } from "react";

// Simple, predictable WASD + click-to-move. Touch joystick is fed in via setExternalAxis.
// Output: refs.input (-1..1 each axis), refs.target ({x,z} | null), refs.cancelTarget()

const KEY_MAP = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export function createMovementController() {
  const keys = { up: false, down: false, left: false, right: false };
  const externalAxis = { x: 0, z: 0 }; // joystick (-1..1)
  let target = null; // click-to-move destination {x, z} or null
  const listeners = new Set();

  const notify = () => listeners.forEach((cb) => cb());

  return {
    keys,
    externalAxis,
    getTarget: () => target,
    setTarget: (next) => {
      target = next;
      notify();
    },
    cancelTarget: () => {
      if (target) {
        target = null;
        notify();
      }
    },
    setKey: (name, down) => {
      if (keys[name] === down) return;
      keys[name] = down;
      // Pressing a movement key cancels click-to-move target.
      if (down && target) {
        target = null;
      }
      notify();
    },
    setExternalAxis: (x, z) => {
      externalAxis.x = x;
      externalAxis.z = z;
      if ((Math.abs(x) > 0.05 || Math.abs(z) > 0.05) && target) {
        target = null;
      }
      notify();
    },
    getAxis: () => {
      // Combine keyboard + joystick. Keyboard yields unit-axis; joystick can be analog.
      let kx = 0;
      let kz = 0;
      if (keys.up) kz -= 1;
      if (keys.down) kz += 1;
      if (keys.left) kx -= 1;
      if (keys.right) kx += 1;
      const x = kx + externalAxis.x;
      const z = kz + externalAxis.z;
      const len = Math.hypot(x, z);
      if (len > 1) return { x: x / len, z: z / len, magnitude: 1 };
      return { x, z, magnitude: len };
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

export function useKeyboardBindings(controller, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onDown = (e) => {
      const name = KEY_MAP[e.code];
      if (!name) return;
      // Don't swallow keys when typing in inputs.
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      e.preventDefault();
      controller.setKey(name, true);
    };
    const onUp = (e) => {
      const name = KEY_MAP[e.code];
      if (!name) return;
      controller.setKey(name, false);
    };
    const onBlur = () => {
      controller.setKey("up", false);
      controller.setKey("down", false);
      controller.setKey("left", false);
      controller.setKey("right", false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
  }, [controller, enabled]);
}

export function useMovementController() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createMovementController();
  return ref.current;
}
