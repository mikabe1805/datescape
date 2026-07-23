import { forwardRef } from "react";
import * as THREE from "three";

// Stylized placeholder figure for the vertical slice. The silhouette is
// intentionally character-like without implying skin tone or gender; a rigged
// customizable avatar family should replace it in the authored-asset phase.
export const AvatarFigure = forwardRef(function AvatarFigure(
  { color = "#72e6cf" },
  ref
) {
  return (
    <group ref={ref} position={[0, 0.55, 0]}>
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} position={[x, 0.13, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.32, 4, 10]} />
          <meshStandardMaterial color="#17282f" roughness={0.62} />
        </mesh>
      ))}

      <mesh position={[0, 0.69, 0]} castShadow>
        <capsuleGeometry args={[0.31, 0.56, 5, 16]} />
        <meshStandardMaterial color="#263941" roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.71, 0.292]}>
        <boxGeometry args={[0.42, 0.08, 0.026]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.58} roughness={0.3} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.39, 0.7, 0]}
          rotation={[0, 0, side * -0.12]}
          castShadow
        >
          <capsuleGeometry args={[0.095, 0.42, 4, 10]} />
          <meshStandardMaterial color="#22343c" roughness={0.54} />
        </mesh>
      ))}

      <mesh position={[0, 1.34, 0]} castShadow>
        <sphereGeometry args={[0.245, 20, 16]} />
        <meshStandardMaterial color="#e9e2d4" roughness={0.48} metalness={0.04} />
      </mesh>
      <mesh position={[-0.08, 1.36, 0.222]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshBasicMaterial color="#25343a" />
      </mesh>
      <mesh position={[0.08, 1.36, 0.222]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshBasicMaterial color="#25343a" />
      </mesh>

      <mesh position={[0, 1.42, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.025, 8, 30]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 1.15, 0.1]} color={color} intensity={0.32} distance={2.2} decay={2} />
    </group>
  );
});
