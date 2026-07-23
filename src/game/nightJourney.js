export const NIGHT_JOURNEY_VERSION = 1;

export const NIGHT_JOURNEY_LANDMARK_IDS = Object.freeze([
  "conservatory",
  "market",
  "resonance",
]);

export const NIGHT_JOURNEY_CHOICE_IDS = Object.freeze([
  "quiet",
  "approach",
  "spark",
  "shared",
]);

const LANDMARK_IDS = new Set(NIGHT_JOURNEY_LANDMARK_IDS);
const CHOICE_IDS = new Set(NIGHT_JOURNEY_CHOICE_IDS);
const MAX_MOMENTS = 16;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const KEEPSAKES = Object.freeze({
  quiet: {
    title: "Moonwater Pause",
    note: "You made room for the night without asking it to become anything.",
    prompt: "What kind of quiet helps you feel most like yourself?",
    color: "#8ad6c6",
  },
  approach: {
    title: "Open Lantern",
    note: "You offered a hello and left the answer entirely in someone else's hands.",
    prompt: "What makes an approach feel easy and respectful to you?",
    color: "#f5c973",
  },
  spark: {
    title: "Twin Ember",
    note: "You followed a little curiosity without demanding an outcome.",
    prompt: "What makes another person feel worth getting curious about?",
    color: "#f19bb8",
  },
  shared: {
    title: "Resonant Thread",
    note: "You made a small moment with someone and let it be enough.",
    prompt: "What can two people make together that neither could make alone?",
    color: "#c4a7ff",
  },
});

function finiteTime(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Number(value) : fallback;
}

function safeString(value, maxLength = 80) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function uniqueAllowed(values, allowed, limit) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => allowed.has(value)))].slice(
    0,
    limit,
  );
}

function uniqueStrings(values, limit) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => safeString(value))
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function keepsakeFor(journey) {
  const kind = journey.choices.at(-1) || "quiet";
  const source = KEEPSAKES[kind] || KEEPSAKES.quiet;
  return {
    id: `${journey.id}:${kind}`,
    kind,
    ...source,
  };
}

export function createNightJourney(
  now = Date.now(),
  nonce = Math.random().toString(36).slice(2, 8),
) {
  const startedAt = finiteTime(now, Date.now());
  const safeNonce = safeString(nonce, 16) || "thread";
  return {
    version: NIGHT_JOURNEY_VERSION,
    id: `afterlight:${Math.trunc(startedAt)}:${safeNonce}`,
    startedAt,
    visited: [],
    moments: [],
    choices: [],
    completedAt: null,
    keepsake: null,
  };
}

export function hydrateNightJourney(value, now = Date.now()) {
  if (!value || typeof value !== "object") return createNightJourney(now);
  const startedAt = finiteTime(value.startedAt, now);
  const fallback = createNightJourney(startedAt);
  const id = safeString(value.id, 128) || fallback.id;
  const journey = {
    version: NIGHT_JOURNEY_VERSION,
    id,
    startedAt,
    visited: uniqueAllowed(value.visited, LANDMARK_IDS, LANDMARK_IDS.size),
    moments: uniqueStrings(value.moments, MAX_MOMENTS),
    choices: uniqueAllowed(value.choices, CHOICE_IDS, CHOICE_IDS.size),
    completedAt: null,
    keepsake: null,
  };
  const progress = nightJourneyProgress(journey);
  if (progress.complete) {
    journey.completedAt = finiteTime(value.completedAt, now);
    journey.keepsake = keepsakeFor(journey);
  }
  return journey;
}

export function nightJourneyProgress(value) {
  const visited = Array.isArray(value?.visited) ? value.visited.length : 0;
  const moments = Array.isArray(value?.moments) ? value.moments.length : 0;
  const choices = Array.isArray(value?.choices) ? value.choices.length : 0;
  const stages = [
    {
      id: "wander",
      label: "Follow the shoreline",
      detail:
        visited >= 2
          ? "Two places found"
          : `Visit ${2 - visited} more ${2 - visited === 1 ? "place" : "places"}`,
      complete: visited >= 2,
    },
    {
      id: "moment",
      label: "Leave a small trace",
      detail: moments > 0 ? "A moment carried" : "Try any place activity",
      complete: moments > 0,
    },
    {
      id: "choice",
      label: "Choose your pace",
      detail:
        choices > 0
          ? "A choice made"
          : "Share, Spark, wave, or take quiet",
      complete: choices > 0,
    },
  ];
  const completed = stages.filter((stage) => stage.complete).length;
  const complete = completed === stages.length;
  return {
    stages,
    completed,
    total: stages.length,
    complete,
    currentStageId:
      stages.find((stage) => !stage.complete)?.id || "complete",
  };
}

export function advanceNightJourney(value, event, now = Date.now()) {
  const journey = hydrateNightJourney(value, now);
  if (journey.completedAt || !event || typeof event !== "object") {
    return journey;
  }

  if (event.type === "visit" && LANDMARK_IDS.has(event.landmarkId)) {
    journey.visited = [...new Set([...journey.visited, event.landmarkId])];
  } else if (event.type === "moment") {
    const id = safeString(event.id);
    if (id) journey.moments = [...new Set([...journey.moments, id])].slice(-MAX_MOMENTS);
  } else if (event.type === "choice" && CHOICE_IDS.has(event.choiceId)) {
    journey.choices = [...new Set([...journey.choices, event.choiceId])];
  } else {
    return journey;
  }

  if (nightJourneyProgress(journey).complete) {
    journey.completedAt = finiteTime(now, Date.now());
    journey.keepsake = keepsakeFor(journey);
  }
  return journey;
}

export function nightJourneyBridgeState(value) {
  const journey = hydrateNightJourney(value);
  const progress = nightJourneyProgress(journey);
  return {
    id: journey.id,
    visited: journey.visited,
    stage: progress.currentStageId,
    complete: progress.complete,
  };
}

export function hydrateNightKeepsakes(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter(
      (value) =>
        value &&
        typeof value === "object" &&
        safeString(value.id, 160) &&
        CHOICE_IDS.has(value.kind) &&
        safeString(value.title, 60) &&
        safeString(value.note, 240) &&
        safeString(value.prompt, 180) &&
        typeof value.color === "string" &&
        HEX_COLOR.test(value.color),
    )
    .map((value) => ({
      id: safeString(value.id, 160),
      kind: value.kind,
      title: safeString(value.title, 60),
      note: safeString(value.note, 240),
      prompt: safeString(value.prompt, 180),
      color: value.color,
      completedAt: finiteTime(value.completedAt, 0),
    }))
    .slice(-12);
}
