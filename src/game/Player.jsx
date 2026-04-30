import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { EMOTE_GLYPHS } from "../components/world/EmoteWheel";

const EMOTE_DURATION_MS = 4200;
const SAY_DURATION_MS = 7000;

export function Player({ playerRef, color = "#f5c973", extrasRef }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const shadowRef = useRef();
  const trailRef = useRef();
  const trailHistory = useRef([]);

  const trailGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(8 * 3);
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame((state, delta) => {
    const p = playerRef.current;
    if (!p || !groupRef.current) return;

    groupRef.current.position.x = p.x;
    groupRef.current.position.z = p.z;
    groupRef.current.rotation.y = p.heading || 0;

    if (bodyRef.current) {
      const speedNorm = Math.min((p.speed || 0) / 5, 1);
      const bob = Math.sin(state.clock.elapsedTime * 9) * 0.06 * speedNorm;
      bodyRef.current.position.y = 0.55 + bob;
      // Lean into motion direction.
      const targetTilt = -speedNorm * 0.18;
      bodyRef.current.rotation.x = THREE.MathUtils.damp(bodyRef.current.rotation.x, targetTilt, 8, delta);
    }

    if (shadowRef.current) {
      const speedNorm = Math.min((p.speed || 0) / 5, 1);
      shadowRef.current.scale.setScalar(0.9 - speedNorm * 0.1);
      shadowRef.current.material.opacity = 0.32 - speedNorm * 0.08;
    }

    // Trail history
    const hist = trailHistory.current;
    hist.push([p.x, p.z]);
    if (hist.length > 8) hist.shift();
    if (trailRef.current && hist.length >= 2) {
      const pos = trailGeometry.attributes.position.array;
      for (let i = 0; i < 8; i++) {
        const sample = hist[Math.max(0, hist.length - 1 - i)];
        pos[i * 3 + 0] = sample[0];
        pos[i * 3 + 1] = 0.04;
        pos[i * 3 + 2] = sample[1];
      }
      trailGeometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={shadowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} />
      </mesh>
      <group ref={bodyRef} position={[0, 0.55, 0]}>
        <mesh castShadow position={[0, 0.45, 0]}>
          <capsuleGeometry args={[0.32, 0.5, 4, 16]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.24, 18, 14]} />
          <meshStandardMaterial color="#fff7e0" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.42, 0]}>
          <ringGeometry args={[0.34, 0.42, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <line ref={trailRef}>
        <primitive object={trailGeometry} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={0.35} />
      </line>
      <EmoteAndSay extrasRef={extrasRef} />
    </group>
  );
}

// Renders emote glyph + chat bubble above the local player.
function EmoteAndSay({ extrasRef }) {
  const [emote, setEmote] = useState(null);
  const [say, setSay] = useState(null);

  useEffect(() => {
    if (!extrasRef) return undefined;
    const id = setInterval(() => {
      const extras = extrasRef.current || {};
      const now = Date.now();
      const e = extras.emote && now - extras.emote.at < EMOTE_DURATION_MS ? extras.emote : null;
      const s = extras.say && now - extras.say.at < SAY_DURATION_MS ? extras.say : null;
      setEmote((prev) => (prev?.at === e?.at ? prev : e));
      setSay((prev) => (prev?.at === s?.at ? prev : s));
    }, 200);
    return () => clearInterval(id);
  }, [extrasRef]);

  return (
    <>
      {emote && (
        <Html position={[0, 2.4, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className="world-emote-bubble">{EMOTE_GLYPHS[emote.type] || "✨"}</div>
        </Html>
      )}
      {say && (
        <Html
          position={[0, 2.0, 0]}
          center
          distanceFactor={9}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="world-say-bubble">{say.text}</div>
        </Html>
      )}
    </>
  );
}
