import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLAZA_DECOR, PLAZA_RADIUS } from "./worldData";

// Static-ish environment: ground disc, water, paths, lanterns, benches, trees, ambient motes.

function Lantern({ position }) {
  const flickerRef = useRef();
  useFrame((state) => {
    if (!flickerRef.current) return;
    flickerRef.current.intensity = 1.6 + Math.sin(state.clock.elapsedTime * 4 + position[0]) * 0.18;
  });
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 8]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffb86b" emissiveIntensity={1.6} roughness={0.4} />
      </mesh>
      <pointLight ref={flickerRef} position={[0, 2.25, 0]} color="#ffb86b" intensity={1.6} distance={9} decay={2} />
    </group>
  );
}

function Bench({ position }) {
  const [x, z, ry] = position;
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.1, 0.4]} />
        <meshStandardMaterial color="#5b3d2a" roughness={0.85} />
      </mesh>
      <mesh position={[-0.55, 0.16, 0]} castShadow>
        <boxGeometry args={[0.1, 0.32, 0.4]} />
        <meshStandardMaterial color="#3e2918" roughness={0.85} />
      </mesh>
      <mesh position={[0.55, 0.16, 0]} castShadow>
        <boxGeometry args={[0.1, 0.32, 0.4]} />
        <meshStandardMaterial color="#3e2918" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Tree({ position }) {
  const [x, z] = position;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.24, 1.8, 8]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <coneGeometry args={[1.2, 2.6, 12]} />
        <meshStandardMaterial color="#2f5a3f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <coneGeometry args={[0.85, 1.6, 10]} />
        <meshStandardMaterial color="#3b6e4d" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Motes({ count = 24 }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * PLAZA_RADIUS * 1.6,
        z: (Math.random() - 0.5) * PLAZA_RADIUS * 1.6,
        baseY: 0.6 + Math.random() * 1.6,
        speed: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      })),
    [count]
  );

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      const y = s.baseY + Math.sin(t * s.speed + s.phase) * 0.5;
      const x = s.x + Math.sin(t * s.speed * 0.6 + s.phase) * 0.3;
      const z = s.z + Math.cos(t * s.speed * 0.7 + s.phase) * 0.3;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.04 + Math.sin(t * 2 + s.phase) * 0.015);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color="#ffe4ae" transparent opacity={0.85} />
    </instancedMesh>
  );
}

function Water() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.material.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 0.4) * 0.05;
  });
  return (
    <mesh ref={ref} position={[0, -0.04, 22]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[80, 26, 1, 1]} />
      <meshStandardMaterial
        color="#1a3850"
        emissive="#1c4a64"
        emissiveIntensity={0.35}
        roughness={0.3}
        metalness={0.6}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

function Paths() {
  // Eight paths radiating from the center to the rim.
  const paths = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    paths.push(
      <mesh
        key={i}
        position={[Math.sin(angle) * 7.5, 0.011, Math.cos(angle) * 7.5]}
        rotation={[-Math.PI / 2, 0, -angle]}
        receiveShadow
      >
        <planeGeometry args={[1.6, 12]} />
        <meshStandardMaterial color="#c9a980" roughness={0.95} />
      </mesh>
    );
  }
  return <>{paths}</>;
}

export function Plaza() {
  return (
    <group>
      {/* Outer ground (grass) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.05, 0]}>
        <circleGeometry args={[36, 48]} />
        <meshStandardMaterial color="#1f3a2c" roughness={0.95} />
      </mesh>

      {/* Inner plaza disc (paving) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0.005, 0]}>
        <circleGeometry args={[PLAZA_RADIUS, 64]} />
        <meshStandardMaterial color="#9d8159" roughness={0.95} />
      </mesh>

      {/* Centermost ring (around the fountain) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[2.5, 3, 48]} />
        <meshStandardMaterial color="#7e6543" roughness={1} />
      </mesh>

      <Paths />

      {/* Outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
        <ringGeometry args={[PLAZA_RADIUS - 0.4, PLAZA_RADIUS - 0.05, 64]} />
        <meshStandardMaterial color="#76603f" roughness={1} />
      </mesh>

      <Water />
      <Motes />

      {PLAZA_DECOR.lanterns.map((p, i) => (
        <Lantern key={i} position={p} />
      ))}
      {PLAZA_DECOR.benches.map((p, i) => (
        <Bench key={i} position={p} />
      ))}
      {PLAZA_DECOR.trees.map((p, i) => (
        <Tree key={i} position={p} />
      ))}
    </group>
  );
}
