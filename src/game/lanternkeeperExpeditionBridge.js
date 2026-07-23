import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  LANTERNKEEPER_DEFINITION_ID,
  LANTERNKEEPER_EXPEDITION_ID,
  LANTERNKEEPER_ROOM_ID,
  LANTERNKEEPER_TARGET_IDS,
} from "./lanternkeeperExpedition";

const SAFE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_INSTANCE_ID = /^lanternkeeper-expedition:[a-f0-9]{40}$/;
const TARGET_IDS = new Set(LANTERNKEEPER_TARGET_IDS);

function safeId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return SAFE_ID.test(text) ? text : null;
}

function safeRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function safeInstanceId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return SAFE_INSTANCE_ID.test(text) ? text : null;
}

function scope() {
  return {
    expeditionId: LANTERNKEEPER_EXPEDITION_ID,
    definitionId: LANTERNKEEPER_DEFINITION_ID,
    room: LANTERNKEEPER_ROOM_ID,
  };
}

function actionPayload({ instanceId, targetId, actionId, expectedRevision }) {
  const safeActionId = safeId(actionId);
  const revision = safeRevision(expectedRevision);
  if (!safeActionId || revision === null) return null;
  const payload = {
    ...scope(),
    actionId: safeActionId,
    expectedRevision: revision,
  };
  if (instanceId !== undefined) {
    const instance = safeInstanceId(instanceId);
    if (!instance) return null;
    payload.instanceId = instance;
  }
  if (targetId !== undefined) {
    if (!TARGET_IDS.has(targetId)) return null;
    payload.targetId = targetId;
  }
  return payload;
}

async function call(name, payload) {
  try {
    const invoke = httpsCallable(functions, name);
    const response = await invoke(payload);
    return response.data || {};
  } catch (error) {
    return {
      expedition: null,
      personal: null,
      progression: null,
      error: error instanceof Error ? error.message : "Expedition unavailable.",
    };
  }
}

export function listLanternkeeperExpeditions() {
  return call("listLanternkeeperExpeditions", scope());
}

export function getLanternkeeperExpedition(instanceId) {
  const instance = safeInstanceId(instanceId);
  if (!instance) {
    return Promise.resolve({
      expedition: null,
      personal: null,
      error: "Choose a valid expedition.",
    });
  }
  return call("getLanternkeeperExpedition", {
    ...scope(),
    instanceId: instance,
  });
}

export function startLanternkeeperExpedition(actionId) {
  const payload = actionPayload({ actionId, expectedRevision: 0 });
  if (!payload) {
    return Promise.resolve({ error: "Provide a valid expedition action." });
  }
  return call("startLanternkeeperExpedition", payload);
}

export function joinLanternkeeperExpedition(
  instanceId,
  actionId,
  expectedRevision,
) {
  const payload = actionPayload({ instanceId, actionId, expectedRevision });
  if (!payload) {
    return Promise.resolve({ error: "Choose a valid open expedition." });
  }
  return call("joinLanternkeeperExpedition", payload);
}

export function leaveLanternkeeperExpedition(
  instanceId,
  actionId,
  expectedRevision,
) {
  const payload = actionPayload({ instanceId, actionId, expectedRevision });
  if (!payload) {
    return Promise.resolve({ error: "Choose a valid active expedition." });
  }
  return call("leaveLanternkeeperExpedition", payload);
}

export function contributeLanternkeeperExpedition(
  instanceId,
  targetId,
  actionId,
  expectedRevision,
) {
  const payload = actionPayload({
    instanceId,
    targetId,
    actionId,
    expectedRevision,
  });
  if (!payload) {
    return Promise.resolve({ error: "Choose a valid expedition objective." });
  }
  return call("contributeLanternkeeperExpedition", payload);
}
