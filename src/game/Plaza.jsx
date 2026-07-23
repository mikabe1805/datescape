import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PLAZA_DECOR, PLAZA_RADIUS } from "./worldData";

function Lantern({ position, index = 0 }) {
  const lightRef = useRef();
  useFrame((state) => {
    if (!lightRef.current) return;
    lightRef.current.intensity = 1.25 + Math.sin(state.clock.elapsedTime * 2.4 + index) * 0.12;
  });
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.065, 2.8, 8]} />
        <meshStandardMaterial color="#14262b" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh position={[0, 2.78, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 0.38, 12]} />
        <meshStandardMaterial
          color="#ffe0a0"
          emissive="#ff9e57"
          emissiveIntensity={2.5}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 2.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.33, 0.018, 6, 24]} />
        <meshBasicMaterial color="#ffbd72" transparent opacity={0.55} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 2.7, 0]}
        color="#ffb86b"
        intensity={1.3}
        distance={7}
        decay={2}
      />
    </group>
  );
}

function Bench({ position }) {
  const [x, z, ry] = position;
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.09, 0.46]} />
        <meshStandardMaterial color="#744b39" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.72, 0.18]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.58, 0.07]} />
        <meshStandardMaterial color="#55362d" roughness={0.76} />
      </mesh>
      {[-0.68, 0.68].map((leg) => (
        <mesh key={leg} position={[leg, 0.18, 0]} castShadow>
          <boxGeometry args={[0.07, 0.36, 0.38]} />
          <meshStandardMaterial color="#14262b" metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ position, index = 0 }) {
  const [x, z] = position;
  const crown = index % 2 === 0 ? "#245c50" : "#31576a";
  return (
    <group position={[x, 0, z]} rotation={[0, index * 0.67, 0]}>
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.3, 2.5, 9]} />
        <meshStandardMaterial color="#392d30" roughness={0.9} />
      </mesh>
      {[
        [0, 2.65, 0, 1.3],
        [0.72, 2.42, 0.12, 0.82],
        [-0.62, 2.5, -0.18, 0.9],
        [0.12, 3.48, 0.08, 0.86],
      ].map(([cx, cy, cz, size], i) => (
        <mesh key={i} position={[cx, cy, cz]} castShadow>
          <icosahedronGeometry args={[size, 1]} />
          <meshStandardMaterial
            color={crown}
            emissive={i === 3 ? "#3d8d82" : "#183d38"}
            emissiveIntensity={0.18}
            roughness={0.92}
          />
        </mesh>
      ))}
      {[0.2, 1.8, 3.6, 5.1].map((a, i) => (
        <mesh key={`b-${i}`} position={[Math.sin(a) * 0.72, 2.55 + (i % 2) * 0.5, Math.cos(a) * 0.72]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color="#83f4dc" />
        </mesh>
      ))}
    </group>
  );
}

function Motes({ count = 70 }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const radius = 4 + Math.random() * (PLAZA_RADIUS - 4);
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          baseY: 0.45 + Math.random() * 2.7,
          speed: 0.12 + Math.random() * 0.32,
          phase: Math.random() * Math.PI * 2,
          scale: 0.02 + Math.random() * 0.025,
        };
      }),
    [count]
  );

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((seed, i) => {
      dummy.position.set(
        seed.x + Math.sin(t * seed.speed + seed.phase) * 0.38,
        seed.baseY + Math.sin(t * seed.speed * 1.4 + seed.phase) * 0.6,
        seed.z + Math.cos(t * seed.speed + seed.phase) * 0.38
      );
      dummy.scale.setScalar(seed.scale * (0.75 + Math.sin(t * 1.8 + seed.phase) * 0.25));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <sphereGeometry args={[1, 6, 5]} />
      <meshBasicMaterial color="#93f5df" transparent opacity={0.78} />
    </instancedMesh>
  );
}

function Water() {
  const materialRef = useRef();
  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.emissiveIntensity = 0.26 + Math.sin(state.clock.elapsedTime * 0.24) * 0.04;
  });
  return (
    <group>
      <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#071a2b"
          emissive="#0c4f67"
          emissiveIntensity={0.28}
          roughness={0.22}
          metalness={0.58}
        />
      </mesh>
      {[28, 34, 42].map((radius, i) => (
        <mesh key={radius} position={[0, -0.13 + i * 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius, radius + 0.04, 96]} />
          <meshBasicMaterial color="#4fb7ca" transparent opacity={0.17 - i * 0.035} />
        </mesh>
      ))}
    </group>
  );
}

function DistrictPaths() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <ringGeometry args={[7.2, 9.1, 96]} />
        <meshStandardMaterial color="#425458" roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[8.08, 8.18, 96]} />
        <meshBasicMaterial color="#79cfc1" transparent opacity={0.28} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 15.5, 0.01, Math.cos(angle) * 15.5]}
            rotation={[-Math.PI / 2, 0, -angle]}
            receiveShadow
          >
            <planeGeometry args={[2.4, 15]} />
            <meshStandardMaterial color="#354b4b" roughness={0.86} />
          </mesh>
        );
      })}
    </group>
  );
}

function GlassArcade() {
  return (
    <group position={[0, 0, 22]}>
      {[-6, -3, 0, 3, 6].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.7, 0]} castShadow>
            <boxGeometry args={[0.12, 3.4, 0.12]} />
            <meshStandardMaterial color="#17363d" metalness={0.7} roughness={0.25} />
          </mesh>
          <mesh position={[0, 3.35, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[1.5, 0.055, 8, 32, Math.PI]} />
            <meshStandardMaterial color="#5ab4a8" emissive="#2b7e73" emissiveIntensity={0.42} />
          </mesh>
          {i < 4 && (
            <mesh position={[1.5, 3.2, 0]}>
              <sphereGeometry args={[0.07, 10, 8]} />
              <meshBasicMaterial color="#ffd19a" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Skyline() {
  const buildings = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const angle = (i / 26) * Math.PI * 2;
        const radius = 34 + (i % 3) * 2.5;
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          y: 2 + (i % 5) * 0.85,
          w: 2.2 + (i % 3) * 0.6,
          d: 2 + ((i + 1) % 3) * 0.7,
          rot: -angle,
        };
      }),
    []
  );
  return (
    <group>
      {buildings.map((building, i) => (
        <group key={i} position={[building.x, 0, building.z]} rotation={[0, building.rot, 0]}>
          <mesh position={[0, building.y / 2, 0]}>
            <boxGeometry args={[building.w, building.y, building.d]} />
            <meshStandardMaterial color={i % 2 ? "#10272f" : "#142b32"} roughness={0.84} />
          </mesh>
          {[0.7, 1.5, 2.3].filter((y) => y < building.y).map((y) => (
            <mesh key={y} position={[0, y, -building.d / 2 - 0.01]}>
              <planeGeometry args={[building.w * 0.55, 0.04]} />
              <meshBasicMaterial color="#eaa767" transparent opacity={0.28} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Plaza() {
  return (
    <group>
      <Water />
      <Skyline />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.08, 0]}>
        <circleGeometry args={[PLAZA_RADIUS + 2.2, 96]} />
        <meshStandardMaterial color="#1b3b36" roughness={0.94} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.015, 0]}>
        <circleGeometry args={[PLAZA_RADIUS, 96]} />
        <meshStandardMaterial color="#344d48" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[PLAZA_RADIUS - 0.4, PLAZA_RADIUS - 0.08, 96]} />
        <meshBasicMaterial color="#67b8aa" transparent opacity={0.34} />
      </mesh>

      <DistrictPaths />
      <GlassArcade />
      <Motes />

      {PLAZA_DECOR.lanterns.map((position, index) => (
        <Lantern key={index} position={position} index={index} />
      ))}
      {PLAZA_DECOR.benches.map((position, index) => (
        <Bench key={index} position={position} />
      ))}
      {PLAZA_DECOR.trees.map((position, index) => (
        <Tree key={index} position={position} index={index} />
      ))}
    </group>
  );
}
