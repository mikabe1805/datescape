import { useEffect, useRef, useState } from "react";

const STICK_RADIUS = 56; // px

export default function Joystick({ controller }) {
  const wellRef = useRef(null);
  const pointerIdRef = useRef(null);
  const originRef = useRef({ x: 0, y: 0 });
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const well = wellRef.current;
    if (!well) return undefined;

    const onDown = (e) => {
      if (pointerIdRef.current !== null) return;
      pointerIdRef.current = e.pointerId;
      const rect = well.getBoundingClientRect();
      originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setActive(true);
      well.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (e.pointerId !== pointerIdRef.current) return;
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, STICK_RADIUS);
      const nx = dist > 0 ? (dx / dist) * clamped : 0;
      const ny = dist > 0 ? (dy / dist) * clamped : 0;
      setThumb({ x: nx, y: ny });
      const ax = nx / STICK_RADIUS;
      const ay = ny / STICK_RADIUS;
      // Joystick up = -y in screen space = -z in world space.
      controller.setExternalAxis(ax, ay);
    };
    const onUp = (e) => {
      if (e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      setActive(false);
      setThumb({ x: 0, y: 0 });
      controller.setExternalAxis(0, 0);
    };

    well.addEventListener("pointerdown", onDown);
    well.addEventListener("pointermove", onMove);
    well.addEventListener("pointerup", onUp);
    well.addEventListener("pointercancel", onUp);
    return () => {
      well.removeEventListener("pointerdown", onDown);
      well.removeEventListener("pointermove", onMove);
      well.removeEventListener("pointerup", onUp);
      well.removeEventListener("pointercancel", onUp);
    };
  }, [controller]);

  return (
    <div className={`world-joystick${active ? " is-active" : ""}`} ref={wellRef}>
      <div className="world-joystick__base" />
      <div
        className="world-joystick__thumb"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      />
      <div className="world-joystick__hint">move</div>
    </div>
  );
}
