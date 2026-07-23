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

function Conservatory({ color }) {
  const glowRef = useRef();
  useFrame((state) => {
    if (glowRef.current) {
      glowRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
        <circleGeometry args={[2.15, 48]} />
        <meshStandardMaterial color="#284746" roughness={0.68} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.82, 2.18, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.48} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[2.08, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#79cfc1"
          transparent
          opacity={0.16}
          roughness={0.08}
          metalness={0.18}
          transmission={0.38}
          side={THREE.DoubleSide}
        />
      </mesh>
      <group ref={glowRef} position={[0, 0.08, 0]}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(angle) * 1.7, 0.68, Math.sin(angle) * 1.7]} rotation={[0, -angle, -0.78]}>
              <boxGeometry args={[0.035, 2.5, 0.035]} />
              <meshStandardMaterial color="#5a9f97" emissive={color} emissiveIntensity={0.18} />
            </mesh>
          );
        })}
      </group>
      <mesh position={[0, 0.78, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.24, 1.45, 9]} />
        <meshStandardMaterial color="#4b3431" roughness={0.86} />
      </mesh>
      {[0, 2.1, 4.2].map((angle, i) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.5, 1.45 + i * 0.12, Math.sin(angle) * 0.5]}>
          <icosahedronGeometry args={[0.74 - i * 0.1, 1]} />
          <meshStandardMaterial color="#327066" emissive={color} emissiveIntensity={0.22} roughness={0.9} />
        </mesh>
      ))}
      <pointLight position={[0, 1.65, 0]} color={color} intensity={1.8} distance={8} decay={2} />
    </group>
  );
}

function LightwellStudio({ color }) {
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[3.4, 2.35, 0.18]} />
        <meshStandardMaterial color="#203b3d" roughness={0.72} />
      </mesh>
      {Array.from({ length: 18 }).map((_, i) => {
        const column = i % 6;
        const row = Math.floor(i / 6);
        const palette = [color, "#6cd8ca", "#8aaeff", "#f18ca5"];
        return (
          <mesh key={i} position={[-1.3 + column * 0.52, 0.52 + row * 0.64, -0.12]}>
            <boxGeometry args={[0.42, 0.48, 0.08]} />
            <meshStandardMaterial
              color={palette[(i * 3 + row) % palette.length]}
              emissive={palette[(i * 3 + row) % palette.length]}
              emissiveIntensity={0.46}
              roughness={0.32}
            />
          </mesh>
        );
      })}
      <mesh position={[0, 2.62, 0]}>
        <boxGeometry args={[3.8, 0.06, 0.06]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight position={[0, 1.5, -0.8]} color={color} intensity={1.2} distance={6} decay={2} />
    </group>
  );
}

function FerryLanding({ color }) {
  return (
    <group>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[4.2, 0.08, 2.2]} />
        <meshStandardMaterial color="#314549" roughness={0.7} />
      </mesh>
      {[-1.7, 1.7].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.25, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, 2.5, 9]} />
            <meshStandardMaterial color="#163138" metalness={0.68} roughness={0.26} />
          </mesh>
          <mesh position={[0, 2.55, 0]}>
            <sphereGeometry args={[0.18, 12, 10]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.1} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.65, -0.75]}>
        <boxGeometry args={[2.7, 0.72, 0.08]} />
        <meshStandardMaterial color="#132c35" emissive="#163e4d" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 1.66, -0.8]}>
        <planeGeometry args={[2.35, 0.42]} />
        <meshBasicMaterial color={color} transparent opacity={0.34} />
      </mesh>
      <pointLight position={[0, 1.7, 0]} color={color} intensity={1.15} distance={7} decay={2} />
    </group>
  );
}

function LandmarkBody({ icon, color }) {
  switch (icon) {
    case "conservatory":
      return <Conservatory color={color} />;
    case "foundry":
      return <ChessTable color={color} />;
    case "market":
      return <CoffeeCart color={color} />;
    case "observatory":
      return <LookoutDeck color={color} />;
    case "garden":
      return <DanceCircle color={color} />;
    case "studio":
      return <LightwellStudio color={color} />;
    case "ferry":
      return <FerryLanding color={color} />;
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
