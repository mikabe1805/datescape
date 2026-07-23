import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Sparkles } from "lucide-react";
import { EMOTE_ICONS } from "../components/world/EmoteWheel";
import { AvatarFigure } from "./AvatarFigure";

const EMOTE_DURATION_MS = 4200;
const SAY_DURATION_MS = 7000;

// Renders another player based on their last presence snapshot.
// The snapshot updates ~6 Hz, so we interpolate visually for smoothness.
export function RemotePlayer({ snapshot, onClick }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const targetRef = useRef({ x: snapshot.x, z: snapshot.z, heading: snapshot.heading || 0 });
  const visualRef = useRef({ x: snapshot.x, z: snapshot.z, heading: snapshot.heading || 0 });

  useEffect(() => {
    targetRef.current = {
      x: snapshot.x ?? 0,
      z: snapshot.z ?? 0,
      heading: snapshot.heading ?? 0,
    };
  }, [snapshot.x, snapshot.z, snapshot.heading]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const v = visualRef.current;
    const t = targetRef.current;
    const dampF = 1 - Math.exp(-9 * delta);
    v.x += (t.x - v.x) * dampF;
    v.z += (t.z - v.z) * dampF;
    const headingDelta = Math.atan2(
      Math.sin(t.heading - v.heading),
      Math.cos(t.heading - v.heading)
    );
    v.heading += headingDelta * Math.min(1, 8 * delta);
    groupRef.current.position.set(v.x, 0, v.z);
    groupRef.current.rotation.y = v.heading;

    if (bodyRef.current) {
      const speedNorm = Math.min((snapshot.speed || 0) / 5, 1);
      bodyRef.current.position.y = 0.55 + Math.sin(state.clock.elapsedTime * 9 + v.x) * 0.06 * speedNorm;
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    onClick?.(snapshot.uid, snapshot);
  };

  return (
    <group ref={groupRef} onClick={handleClick}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
      <AvatarFigure ref={bodyRef} color={snapshot.color || "#aac8df"} />
      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div className="world-remote-tag" onClick={handleClick}>
          <span className="world-remote-tag__dot" style={{ background: snapshot.color || "#aac8df" }} />
          <span className="world-remote-tag__identity">
            <span className="world-remote-tag__name">{snapshot.name || "Player"}</span>
            <span className="world-remote-tag__intent">
              {snapshot.intent === "solo" ? "quiet" : snapshot.intent === "meet" ? "open to meeting" : snapshot.intent === "match" ? "with a connection" : "social"}
            </span>
          </span>
        </div>
      </Html>
      <RemoteEmoteAndSay snapshot={snapshot} />
    </group>
  );
}

function RemoteEmoteAndSay({ snapshot }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 1000000), 250);
    return () => clearInterval(id);
  }, []);
  void tick;
  const now = Date.now();
  const emote = snapshot.emote && now - snapshot.emote.at < EMOTE_DURATION_MS ? snapshot.emote : null;
  const say = snapshot.say && now - snapshot.say.at < SAY_DURATION_MS ? snapshot.say : null;
  const EmoteIcon = EMOTE_ICONS[emote?.type] || Sparkles;
  return (
    <>
      {emote && (
        <Html position={[0, 2.7, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className="world-emote-bubble">
            <EmoteIcon aria-hidden="true" />
          </div>
        </Html>
      )}
      {say && (
        <Html
          position={[0, 2.4, 0]}
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
