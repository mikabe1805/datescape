import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Sparkles } from "lucide-react";
import { EMOTE_ICONS } from "../components/world/EmoteWheel";
import { AvatarFigure } from "./AvatarFigure";

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
      <AvatarFigure ref={bodyRef} color={color} />
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

  const EmoteIcon = EMOTE_ICONS[emote?.type] || Sparkles;

  return (
    <>
      {emote && (
        <Html position={[0, 2.4, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className="world-emote-bubble">
            <EmoteIcon aria-hidden="true" />
          </div>
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
