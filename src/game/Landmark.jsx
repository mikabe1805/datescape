import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { INTERACTION_RADIUS } from "./worldData";

function FountainStructure({ color }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.7, 0.4, 32]} />
        <meshStandardMaterial color="#a89270" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 0.1, 32]} />
        <meshStandardMaterial color="#3a6f7a" emissive={color} emissiveIntensity={0.4} roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.3, 1.0, 12]} />
        <meshStandardMaterial color="#b7997a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.32, 18, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={0.4} />
      </mesh>
      <pointLight position={[0, 1.6, 0]} color={color} intensity={1.2} distance={6} decay={2} />
    </group>
  );
}

function ChessTable({ color }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.1, 32]} />
        <meshStandardMaterial color="#30221a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 0.45, 12]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      {[
        [0.5, 0.5],
        [-0.5, 0.5],
        [0.5, -0.5],
        [-0.5, -0.5],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.55, dz]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#e9d6a8" : "#3a2a1c"} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.42, 18, 14]} />
        <meshStandardMaterial color="#fff1c9" emissive={color} emissiveIntensity={1.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <ringGeometry args={[0.45, 0.55, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 1.5, 0]} color={color} intensity={1} distance={5} decay={2} />
    </group>
  );
}

function CoffeeCart({ color }) {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.2, 0.9]} />
        <meshStandardMaterial color="#7a4d3c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[1.8, 0.06, 1.05]} />
        <meshStandardMaterial color="#5a3220" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[1.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 1.7, 0]}>
          <sphereGeometry args={[0.08, 12, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={0.4} />
        </mesh>
      ))}
      <pointLight position={[0, 1.6, 0]} color={color} intensity={0.9} distance={4.5} decay={2} />
    </group>
  );
}

function LookoutDeck({ color }) {
  return (
    <group>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[3.2, 0.08, 2.0]} />
        <meshStandardMaterial color="#5b3d2a" roughness={0.85} />
      </mesh>
      {[-1.4, 1.4].map((x, i) => (
        <mesh key={i} position={[x, 0.5, -0.9]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
          <meshStandardMaterial color="#3e2918" />
        </mesh>
      ))}
      <mesh position={[0, 0.95, -0.9]}>
        <boxGeometry args={[2.9, 0.08, 0.06]} />
        <meshStandardMaterial color="#3e2918" />
      </mesh>
      <mesh position={[0, 1.6, -0.9]}>
        <sphereGeometry args={[0.18, 14, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
      </mesh>
      <pointLight position={[0, 1.6, -0.9]} color={color} intensity={0.9} distance={5} decay={2} />
    </group>
  );
}

function DanceCircle({ color }) {
  const ringRef = useRef();
  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.3;
    }
  });
  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[1.7, 2.0, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.sin(a) * 2.2;
        const z = Math.cos(a) * 2.2;
        return (
          <mesh key={i} position={[x, 1.6, z]}>
            <sphereGeometry args={[0.12, 12, 10]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.5]} />
        <meshStandardMaterial color="#2a2030" />
      </mesh>
      <pointLight position={[0, 1.8, 0]} color={color} intensity={1} distance={5.5} decay={2} />
    </group>
  );
}

function LandmarkBody({ icon, color }) {
  switch (icon) {
    case "fountain":
      return <FountainStructure color={color} />;
    case "chess":
      return <ChessTable color={color} />;
    case "coffee":
      return <CoffeeCart color={color} />;
    case "stars":
      return <LookoutDeck color={color} />;
    case "music":
      return <DanceCircle color={color} />;
    default:
      return null;
  }
}

export function Landmark({ landmark, isNearby, isFocused, onClick }) {
  const [x, , z] = landmark.position;
  const ringRef = useRef();
  const labelOpacity = useRef(0);

  useFrame((state, delta) => {
    if (ringRef.current) {
      const t = state.clock.elapsedTime;
      const target = isNearby ? 1 : isFocused ? 0.6 : 0.25;
      ringRef.current.material.opacity = THREE.MathUtils.damp(
        ringRef.current.material.opacity,
        target,
        6,
        delta
      );
      ringRef.current.scale.setScalar(1 + Math.sin(t * 2 + x) * 0.04);
    }
    labelOpacity.current = THREE.MathUtils.damp(
      labelOpacity.current,
      isNearby ? 1 : 0.55,
      5,
      delta
    );
  });

  return (
    <group position={[x, 0, z]} onClick={onClick}>
      <LandmarkBody icon={landmark.icon} color={landmark.color} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[INTERACTION_RADIUS - 0.15, INTERACTION_RADIUS, 48]} />
        <meshBasicMaterial color={landmark.color} transparent opacity={0.25} />
      </mesh>
      <Html position={[0, 2.8, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div className={`world-nameplate${isNearby ? " is-near" : ""}`}>
          <div className="world-nameplate__title">{landmark.name}</div>
          <div className="world-nameplate__subtitle">{landmark.subtitle}</div>
        </div>
      </Html>
    </group>
  );
}
