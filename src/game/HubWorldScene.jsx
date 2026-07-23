import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Plaza } from "./Plaza";
import { Player } from "./Player";
import { RemotePlayer } from "./RemotePlayer";
import { Landmark } from "./Landmark";
import { NamedNpc, AmbientNpc } from "./Npc";
import { CameraRig, DEFAULT_ORBIT } from "./CameraRig";
import {
  AMBIENT_NPCS,
  INTERACTION_RADIUS,
  INTERACTION_RELEASE,
  LANDMARKS,
  NPCS,
  PLAZA_RADIUS,
} from "./worldData";

const MAX_SPEED = 5.2;
const ACCEL_RATE = 9;
const FRICTION_RATE = 6;
const HEADING_TURN_RATE = 12;
const MIN_PLAYER_DISTANCE = 0.5;
const ARRIVAL_RADIUS = 0.18;

function SceneContent({
  controller,
  playerStateRef,
  cameraOrbitRef,
  onNearbyChange,
  onPlayerSnapshot,
  nearbyLandmarkId,
  focusedLandmarkId,
  paused,
  avatarColor,
  remotePlayers,
  onRemotePlayerClick,
  extrasRef,
}) {
  const lastNearbyRef = useRef(null);
  const lastSnapshotRef = useRef({ x: 0, z: 0, heading: 0, speed: 0 });
  const sinceSnapshotRef = useRef(0);
  const velocityRef = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.05);
    const player = playerStateRef.current;
    const axis = controller.getAxis();
    const target = controller.getTarget();

    let desiredX = 0;
    let desiredZ = 0;
    let desiredMagnitude = 0;

    if (axis.magnitude > 0.05) {
      // Rotate keyboard/joystick axis by camera yaw so W is "away from camera".
      const yaw = cameraOrbitRef.current.yaw || 0;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      desiredX = axis.x * cy + axis.z * sy;
      desiredZ = axis.z * cy - axis.x * sy;
      desiredMagnitude = Math.min(axis.magnitude, 1);
    } else if (target) {
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= ARRIVAL_RADIUS) {
        controller.cancelTarget();
      } else {
        const slow = Math.min(1, dist / 1.2);
        desiredX = dx / dist;
        desiredZ = dz / dist;
        desiredMagnitude = slow;
      }
    }

    if (desiredMagnitude > 0.01) {
      velocityRef.current.x = THREE.MathUtils.damp(
        velocityRef.current.x,
        desiredX * MAX_SPEED * desiredMagnitude,
        ACCEL_RATE,
        dt
      );
      velocityRef.current.z = THREE.MathUtils.damp(
        velocityRef.current.z,
        desiredZ * MAX_SPEED * desiredMagnitude,
        ACCEL_RATE,
        dt
      );
    } else {
      velocityRef.current.x = THREE.MathUtils.damp(velocityRef.current.x, 0, FRICTION_RATE, dt);
      velocityRef.current.z = THREE.MathUtils.damp(velocityRef.current.z, 0, FRICTION_RATE, dt);
    }

    let nextX = player.x + velocityRef.current.x * dt;
    let nextZ = player.z + velocityRef.current.z * dt;

    const fromCenter = Math.hypot(nextX, nextZ);
    const maxR = PLAZA_RADIUS - 0.6;
    if (fromCenter > maxR) {
      const k = maxR / fromCenter;
      nextX *= k;
      nextZ *= k;
      velocityRef.current.x *= 0.5;
      velocityRef.current.z *= 0.5;
    }

    for (const lm of LANDMARKS) {
      const dx = nextX - lm.position[0];
      const dz = nextZ - lm.position[2];
      const dist = Math.hypot(dx, dz);
      if (dist < MIN_PLAYER_DISTANCE) {
        const push = (MIN_PLAYER_DISTANCE - dist) / Math.max(dist, 0.0001);
        nextX += dx * push;
        nextZ += dz * push;
        velocityRef.current.x *= 0.6;
        velocityRef.current.z *= 0.6;
      }
    }

    player.x = nextX;
    player.z = nextZ;

    const speed = Math.hypot(velocityRef.current.x, velocityRef.current.z);
    player.speed = speed;
    if (speed > 0.4) {
      const desiredHeading = Math.atan2(velocityRef.current.x, velocityRef.current.z);
      const headingDelta = Math.atan2(
        Math.sin(desiredHeading - player.heading),
        Math.cos(desiredHeading - player.heading)
      );
      player.heading += headingDelta * Math.min(1, HEADING_TURN_RATE * dt);
    }

    let bestId = null;
    let bestDist = Infinity;
    for (const lm of LANDMARKS) {
      const dx = lm.position[0] - player.x;
      const dz = lm.position[2] - player.z;
      const dist = Math.hypot(dx, dz);
      const radius = lastNearbyRef.current === lm.id ? INTERACTION_RELEASE : INTERACTION_RADIUS;
      if (dist < radius && dist < bestDist) {
        bestDist = dist;
        bestId = lm.id;
      }
    }
    if (bestId !== lastNearbyRef.current) {
      lastNearbyRef.current = bestId;
      onNearbyChange(bestId);
    }

    sinceSnapshotRef.current += dt;
    if (sinceSnapshotRef.current >= 0.05) {
      const last = lastSnapshotRef.current;
      const dx = player.x - last.x;
      const dz = player.z - last.z;
      const dh = Math.atan2(
        Math.sin(player.heading - last.heading),
        Math.cos(player.heading - last.heading)
      );
      if (
        Math.hypot(dx, dz) > 0.02 ||
        Math.abs(dh) > 0.02 ||
        Math.abs(player.speed - last.speed) > 0.05
      ) {
        const snapshot = { x: player.x, z: player.z, heading: player.heading, speed: player.speed };
        lastSnapshotRef.current = snapshot;
        onPlayerSnapshot(snapshot);
      }
      sinceSnapshotRef.current = 0;
    }
  });

  const handleGroundClick = (event) => {
    if (paused) return;
    const point = event.point;
    if (!point) return;
    const fromCenter = Math.hypot(point.x, point.z);
    if (fromCenter > PLAZA_RADIUS - 0.4) return;
    controller.setTarget({ x: point.x, z: point.z });
  };

  const handleLandmarkClick = (id) => (event) => {
    event.stopPropagation();
    const lm = LANDMARKS.find((l) => l.id === id);
    if (!lm) return;
    const dx = playerStateRef.current.x - lm.position[0];
    const dz = playerStateRef.current.z - lm.position[2];
    const dist = Math.hypot(dx, dz) || 1;
    const stand = INTERACTION_RADIUS * 0.7;
    controller.setTarget({
      x: lm.position[0] + (dx / dist) * stand,
      z: lm.position[2] + (dz / dist) * stand,
    });
  };

  return (
    <>
      <color attach="background" args={["#06141f"]} />
      <fog attach="fog" args={["#071722", 31, 74]} />
      <ambientLight intensity={0.24} color="#9fc4bb" />
      <hemisphereLight args={["#718db5", "#17362e", 0.92]} />
      <directionalLight
        position={[-12, 18, 8]}
        intensity={1.34}
        color="#ffd4ad"
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />
      <directionalLight position={[18, 10, -16]} intensity={0.48} color="#7598ff" />
      <pointLight position={[0, 12, 0]} intensity={0.42} color="#7cf0d8" distance={35} />

      <mesh scale={88}>
        <sphereGeometry args={[1, 32, 18]} />
        <meshBasicMaterial color="#071b28" side={THREE.BackSide} fog={false} />
      </mesh>

      <Plaza />

      <mesh
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleGroundClick}
      >
        <circleGeometry args={[PLAZA_RADIUS - 0.3, 48]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {LANDMARKS.map((landmark) => (
        <Landmark
          key={landmark.id}
          landmark={landmark}
          isNearby={nearbyLandmarkId === landmark.id}
          isFocused={focusedLandmarkId === landmark.id}
          onClick={handleLandmarkClick(landmark.id)}
        />
      ))}

      {LANDMARKS.filter((l) => l.npcId).map((landmark) => {
        const npc = NPCS[landmark.npcId];
        const radial = Math.atan2(landmark.position[0], landmark.position[2]);
        const offset = 1.1;
        const npcPos = [
          landmark.position[0] + Math.sin(radial) * offset,
          0,
          landmark.position[2] + Math.cos(radial) * offset,
        ];
        return (
          <NamedNpc
            key={landmark.npcId}
            npc={npc}
            position={npcPos}
            isFocused={focusedLandmarkId === landmark.id}
          />
        );
      })}

      {AMBIENT_NPCS.map((npc) => (
        <AmbientNpc key={npc.id} npc={npc} />
      ))}

      {remotePlayers?.map((rp) => (
        <RemotePlayer key={rp.uid} snapshot={rp} onClick={onRemotePlayerClick} />
      ))}

      <Player playerRef={playerStateRef} color={avatarColor} extrasRef={extrasRef} />
      <CameraRig playerRef={playerStateRef} orbitRef={cameraOrbitRef} />
    </>
  );
}

export default function HubWorldScene({
  controller,
  playerStateRef,
  onNearbyChange,
  onPlayerSnapshot,
  nearbyLandmarkId,
  focusedLandmarkId,
  paused,
  avatarColor,
  remotePlayers,
  onRemotePlayerClick,
  extrasRef,
}) {
  const fallbackRef = useRef({ x: 0, z: 6, heading: 0, speed: 0 });
  const stateRef = playerStateRef || fallbackRef;
  const cameraOrbitRef = useRef({ ...DEFAULT_ORBIT });

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      camera={{ position: [0, 10, 15], fov: 47, near: 0.1, far: 220 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.08;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <SceneContent
        controller={controller}
        playerStateRef={stateRef}
        cameraOrbitRef={cameraOrbitRef}
        onNearbyChange={onNearbyChange}
        onPlayerSnapshot={onPlayerSnapshot}
        nearbyLandmarkId={nearbyLandmarkId}
        focusedLandmarkId={focusedLandmarkId}
        paused={paused}
        avatarColor={avatarColor}
        remotePlayers={remotePlayers}
        onRemotePlayerClick={onRemotePlayerClick}
        extrasRef={extrasRef}
      />
    </Canvas>
  );
}
