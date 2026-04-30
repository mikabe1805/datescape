import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Orbit-style follow camera: fixed pitch, fixed distance with zoom slider, yaw the user can drag.
// No automatic camera rotation when the player turns. The world rotates relative to the player's heading,
// not to the camera.

const BASE_DISTANCE = 11.5;
const BASE_HEIGHT = 7.5;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 18;
const POSITION_DAMP = 6;
const LOOK_DAMP = 9;
const LOOKAHEAD_FACTOR = 1.4;

export function CameraRig({ playerRef, orbitRef }) {
  const { camera, gl } = useThree();
  const lookAtRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const dom = gl.domElement;
    const activePointers = new Map();
    let lastPinchDist = null;

    const onPointerDown = (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
      if (e.pointerType === "touch" && activePointers.size === 2) {
        const [a, b] = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onPointerMove = (e) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      activePointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });

      if (e.pointerType === "mouse" && (prev.button === 2 || e.buttons === 2 || (prev.button === 0 && e.shiftKey))) {
        // right or shift+left mouse drag → yaw
        orbitRef.current.yaw -= dx * 0.005;
        e.preventDefault();
      } else if (e.pointerType === "touch" && activePointers.size === 2) {
        const [a, b] = Array.from(activePointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinchDist != null) {
          const delta = dist - lastPinchDist;
          orbitRef.current.zoom = THREE.MathUtils.clamp(
            orbitRef.current.zoom - delta * 0.04,
            MIN_DISTANCE - BASE_DISTANCE,
            MAX_DISTANCE - BASE_DISTANCE
          );
        }
        lastPinchDist = dist;
        orbitRef.current.yaw -= dx * 0.004;
      }
    };
    const onPointerUp = (e) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = null;
    };
    const onContext = (e) => e.preventDefault();
    const onWheel = (e) => {
      e.preventDefault();
      orbitRef.current.zoom = THREE.MathUtils.clamp(
        orbitRef.current.zoom + e.deltaY * 0.01,
        MIN_DISTANCE - BASE_DISTANCE,
        MAX_DISTANCE - BASE_DISTANCE
      );
    };

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("contextmenu", onContext);
    dom.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("contextmenu", onContext);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [gl, orbitRef]);

  useFrame((_, delta) => {
    const player = playerRef.current;
    if (!player) return;

    const dampFactor = 1 - Math.exp(-POSITION_DAMP * delta);
    const lookFactor = 1 - Math.exp(-LOOK_DAMP * delta);

    const distance = THREE.MathUtils.clamp(
      BASE_DISTANCE + (orbitRef.current.zoom || 0),
      MIN_DISTANCE,
      MAX_DISTANCE
    );
    const height = BASE_HEIGHT + (orbitRef.current.zoom || 0) * 0.35;
    const yaw = orbitRef.current.yaw || 0;

    // Lookahead in player movement direction so the world reads forward.
    const lookahead = LOOKAHEAD_FACTOR * Math.min(player.speed || 0, 1.4);
    const ahead = new THREE.Vector3(
      Math.sin(player.heading || 0) * lookahead,
      0,
      Math.cos(player.heading || 0) * lookahead
    );

    targetPosRef.current.set(
      player.x + Math.sin(yaw) * distance + ahead.x * 0.6,
      height,
      player.z + Math.cos(yaw) * distance + ahead.z * 0.6
    );

    camera.position.lerp(targetPosRef.current, dampFactor);

    const desiredLook = new THREE.Vector3(player.x + ahead.x * 0.4, 0.6, player.z + ahead.z * 0.4);
    lookAtRef.current.lerp(desiredLook, lookFactor);
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

export const DEFAULT_ORBIT = { yaw: 0, zoom: 0 };
