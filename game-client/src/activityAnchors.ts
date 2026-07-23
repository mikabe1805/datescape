import type { ActivityState } from "./bridge";

export type ActivityAnchor = {
  x: number;
  y: number;
  z: number;
  heading: number;
};

export const ACTIVITY_ANCHORS = {
  "listening-crescent": [
    { x: -2.416, y: 0.11, z: 6.289, heading: -47 },
    { x: -4.684, y: 0.11, z: 6.289, heading: 47 },
  ],
  // Authored INT_RG_LoomTune_Left/Right anchors, transformed through the
  // Resonance Garden assembly at z -14.3.
  "resonance-duet": [
    { x: -1.1, y: 0.42, z: -15.48, heading: 0 },
    { x: 1.1, y: 0.42, z: -15.48, heading: 0 },
  ],
} as const satisfies Record<
  ActivityState["id"],
  readonly [ActivityAnchor, ActivityAnchor]
>;

const LISTENING_PARTNER_RADIUS = 1.4;

export type ListeningPartnerSelection = {
  uid: string;
  anchor: ActivityAnchor;
};

/**
 * Selects one avatar at the occupied seat opposite the local player. The shell
 * only exposes consent-safe activity phase/slot data, so the renderer uses
 * public position and a stable UID tie-break without receiving partner identity.
 */
export function selectListeningPartner<T>(
  activity: ActivityState | null,
  candidates: Iterable<readonly [uid: string, candidate: T]>,
  getPosition: (candidate: T) => { x: number; z: number },
): ListeningPartnerSelection | null {
  if (activity?.id !== "listening-crescent") return null;
  const partnerSlot = activity.slot === 0 ? 1 : 0;
  const anchor = ACTIVITY_ANCHORS["listening-crescent"][partnerSlot];
  const radiusSquared = LISTENING_PARTNER_RADIUS ** 2;
  let selectedUid: string | null = null;
  let selectedDistanceSquared = Number.POSITIVE_INFINITY;

  for (const [uid, candidate] of candidates) {
    const { x, z } = getPosition(candidate);
    const distanceSquared = (x - anchor.x) ** 2 + (z - anchor.z) ** 2;
    if (distanceSquared > radiusSquared) continue;
    const isNearer = distanceSquared < selectedDistanceSquared;
    const winsStableTie =
      distanceSquared === selectedDistanceSquared &&
      (selectedUid === null || uid < selectedUid);
    if (!isNearer && !winsStableTie) continue;
    selectedUid = uid;
    selectedDistanceSquared = distanceSquared;
  }

  return selectedUid === null ? null : { uid: selectedUid, anchor };
}
