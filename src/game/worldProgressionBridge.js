import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { WORLD_EVENT_TYPES } from "./worldProgression";

const FIRST_LIGHT_QUEST_ID = "afterlight-sunthread";
const RAINLIGHT_QUEST_ID = "afterlight-rainlight-rising";
const LANTERNKEEPER_QUEST_ID = "afterlight-lanternkeeper-expedition";
const QUEST_NPCS = Object.freeze({
  [FIRST_LIGHT_QUEST_ID]: "sol",
  [RAINLIGHT_QUEST_ID]: "juno",
  [LANTERNKEEPER_QUEST_ID]: "juno",
});

export function worldQuestServerEvent(event) {
  if (!event?.id || !event?.type) return null;
  const inferredQuestId =
    event.type === WORLD_EVENT_TYPES.LANDMARK_VISITED &&
    event.landmarkId === "conservatory"
      ? FIRST_LIGHT_QUEST_ID
      : event.type === WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED &&
          event.landmarkId === "conservatory" &&
          event.activityId === "recover-prism"
        ? FIRST_LIGHT_QUEST_ID
        : event.type === WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED &&
            event.landmarkId === "resonance" &&
            event.activityId === "wake-rainlight"
          ? RAINLIGHT_QUEST_ID
          : "";
  const questId = String(event.questId || inferredQuestId);
  const base = {
    eventId: String(event.id).slice(0, 160),
    questId,
    type: event.type,
  };

  if (
    event.type === WORLD_EVENT_TYPES.QUEST_ACCEPTED ||
    event.type === WORLD_EVENT_TYPES.QUEST_TURNED_IN
  ) {
    const npcId = QUEST_NPCS[questId];
    return npcId && event.npcId === npcId
      ? { ...base, npcId }
      : null;
  }
  if (event.type === WORLD_EVENT_TYPES.LANDMARK_VISITED) {
    return questId === FIRST_LIGHT_QUEST_ID &&
      event.landmarkId === "conservatory"
      ? { ...base, landmarkId: "conservatory" }
      : null;
  }
  if (event.type === WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED) {
    if (
      questId === FIRST_LIGHT_QUEST_ID &&
      event.landmarkId === "conservatory" &&
      event.activityId === "recover-prism"
    ) {
      return {
        ...base,
        landmarkId: "conservatory",
        activityId: "recover-prism",
      };
    }
    return questId === RAINLIGHT_QUEST_ID &&
      event.landmarkId === "resonance" &&
      event.activityId === "wake-rainlight"
      ? {
          ...base,
          landmarkId: "resonance",
          activityId: "wake-rainlight",
        }
      : null;
  }

  // Cooperative proof is deliberately absent. The server advances it only
  // after validating the live Resonance match and all six match-bound notes.
  return null;
}

// Kept as a compatibility alias for existing callers/tests. It now maps the
// full bounded quest graph, not only First Light.
export const firstLightServerEvent = worldQuestServerEvent;

export async function loadWorldProgression() {
  try {
    const load = httpsCallable(functions, "getWorldProgression");
    const response = await load();
    return { progression: response.data?.progression || null };
  } catch (error) {
    return { progression: null, error: error.message };
  }
}

export async function recordWorldProgressionEvent(event) {
  const payload = worldQuestServerEvent(event);
  if (!payload) return { ignored: true, progression: null };
  try {
    const record = httpsCallable(functions, "recordWorldQuestEvent");
    const response = await record(payload);
    return {
      ignored: false,
      applied: response.data?.applied === true,
      duplicate: response.data?.duplicate === true,
      progression: response.data?.progression || null,
    };
  } catch (error) {
    return { ignored: false, progression: null, error: error.message };
  }
}
