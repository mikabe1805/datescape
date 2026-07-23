import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  RAINLIGHT_RELAY_ID,
  RAINLIGHT_ROOM_ID,
  RAINLIGHT_SOURCES,
} from "./rainlightRelay";

function safeActionId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9:_-]{1,160}$/.test(text) ? text : null;
}

export function rainlightContributionPayload(sourceId, actionId) {
  if (!RAINLIGHT_SOURCES.includes(sourceId)) return null;
  const safeId = safeActionId(actionId);
  if (!safeId) return null;
  return {
    eventId: RAINLIGHT_RELAY_ID,
    room: RAINLIGHT_ROOM_ID,
    sourceId,
    actionId: safeId,
  };
}

export async function loadRainlightRelay() {
  try {
    const load = httpsCallable(functions, "getRainlightRelay");
    const response = await load({
      eventId: RAINLIGHT_RELAY_ID,
      room: RAINLIGHT_ROOM_ID,
    });
    return {
      event: response.data?.event || null,
      personal: response.data?.personal || null,
    };
  } catch (error) {
    return { event: null, personal: null, error: error.message };
  }
}

export async function contributeRainlightRelay(sourceId, actionId) {
  const payload = rainlightContributionPayload(sourceId, actionId);
  if (!payload) {
    return {
      event: null,
      personal: null,
      progression: null,
      error: "Choose a valid Rainlight source.",
    };
  }
  try {
    const contribute = httpsCallable(functions, "contributeRainlightRelay");
    const response = await contribute(payload);
    return {
      applied: response.data?.applied === true,
      duplicate: response.data?.duplicate === true,
      event: response.data?.event || null,
      personal: response.data?.personal || null,
      progression: response.data?.progression || null,
    };
  } catch (error) {
    return {
      event: null,
      personal: null,
      progression: null,
      error: error.message,
    };
  }
}

