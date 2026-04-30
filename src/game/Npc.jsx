import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Two flavors:
//   <NamedNpc> — stands at a landmark home, gentle idle motion, name label.
//   <AmbientNpc> — wanders between waypoints to make the plaza feel populated.

export function NamedNpc({ npc, position, isFocused }) {
  const groupRef = useRef();
  const bodyRef = useRef();

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    if (bodyRef.current) {
      bodyRef.current.position.y = 0.55 + Math.sin(t * 1.2 + position[0]) * 0.04;
      const targetY = isFocused ? 0 : Math.sin(t * 0.4 + position[2]) * 0.4;
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, targetY, 3, delta);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} />
      </mesh>
      <group ref={bodyRef}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.3, 0.45, 4, 14]} />
          <meshStandardMaterial color={npc.color} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.0, 0]} castShadow>
          <sphereGeometry args={[0.22, 16, 12]} />
          <meshStandardMaterial color="#fff7e0" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

export function AmbientNpc({ npc }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const stateRef = useRef({
    waypointIndex: 0,
    pos: [...npc.waypoints[0]],
    heading: 0,
    pause: 1 + Math.random() * 1.5,
  });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const s = stateRef.current;
    const t = state.clock.elapsedTime;
    const target = npc.waypoints[s.waypointIndex];
    const dx = target[0] - s.pos[0];
    const dz = target[2] - s.pos[2];
    const dist = Math.hypot(dx, dz);

    if (dist < 0.2) {
      s.pause -= delta;
      if (s.pause <= 0) {
        s.waypointIndex = (s.waypointIndex + 1) % npc.waypoints.length;
        s.pause = 1 + Math.random() * 1.8;
      }
    } else {
      const step = Math.min(npc.speed * delta, dist);
      const dirX = dx / dist;
      const dirZ = dz / dist;
      s.pos[0] += dirX * step;
      s.pos[2] += dirZ * step;
      s.heading = Math.atan2(dirX, dirZ);
    }

    groupRef.current.position.set(s.pos[0], 0, s.pos[2]);
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, s.heading, 6, delta);
    if (bodyRef.current) {
      const speedNorm = dist > 0.2 ? Math.min(npc.speed / 2, 1) : 0;
      bodyRef.current.position.y = 0.55 + Math.sin(t * 7 + npc.waypoints[0][0]) * 0.05 * speedNorm;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 18]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      <group ref={bodyRef}>
        <mesh position={[0, 0.4, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.4, 4, 12]} />
          <meshStandardMaterial color={npc.color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.92, 0]} castShadow>
          <sphereGeometry args={[0.2, 14, 10]} />
          <meshStandardMaterial color="#fff7e0" roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}
