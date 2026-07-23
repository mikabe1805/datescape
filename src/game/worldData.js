// Afterlight's first playable district. Content remains data-driven so the
// environment and activity layer can grow independently from the scene code.

export const PLAZA_RADIUS = 24;
export const INTERACTION_RADIUS = 2.8;
export const INTERACTION_RELEASE = 3.35;

export const DISTRICT = {
  id: "afterlight-shore",
  name: "Afterlight Shore",
  city: "Afterlight",
  weather: "Warm rain clearing",
  event: "Rainlight Relay",
  eventTime: "9:00 PM",
};

export const LANDMARKS = [
  {
    id: "conservatory",
    name: "Arrival Conservatory",
    subtitle: "Choose how you want to be here.",
    position: [0, 0, 25],
    color: "#72e6cf",
    icon: "conservatory",
    blurb:
      "An old glasshouse restored with living light. It is a calm place to arrive, change your pace, and decide what kind of night you want.",
    activities: [
      {
        id: "recover-prism",
        kind: "quest",
        questId: "afterlight-sunthread",
        objectiveId: "recover-rain-prism",
        label: "Recover the rain prism",
        description:
          "Search the rain garden for the prism Sol asked you to bring back.",
        response:
          "A pale prism glints beneath the fern bed. When you lift it, a thread of sunrise points toward the Resonance Garden.",
      },
      {
        id: "reset-intent",
        kind: "oneShot",
        label: "Take a quiet minute",
        description: "Reset before you rejoin the district.",
        response:
          "Rain moves softly over the glass. The city can wait until you are ready.",
      },
      {
        id: "rainlight-relay",
        kind: "publicEvent",
        eventId: "rainlight-relay",
        sourceId: "conservatory",
        label: "Bank Conservatory light",
        description:
          "Add this glasshouse note to the district-wide Relay. Your light stays banked if you leave.",
      },
    ],
  },
  {
    id: "market",
    name: "Lantern Market",
    subtitle: "Small plates, shared tables.",
    position: [0, 0, 3.5],
    color: "#ff8e9f",
    icon: "market",
    npcId: "sol",
    blurb:
      "Steam, citrus, and neon reflected in wet stone. The standing tables are intentionally small enough that strangers can join without interrupting.",
    activities: [
      {
        id: "listening-crescent",
        kind: "social",
        stationId: "listening-crescent",
        stationName: "Listening Crescent",
        label: "Join the Listening Crescent",
        description:
          "Share one gentle prompt with one person nearby. Passing or leaving is always okay.",
      },
      {
        id: "taste-note",
        kind: "oneShot",
        label: "Pick the mystery note",
        description: "A 60-second icebreaker: smoky, bright, or strange?",
        response:
          "You choose bright. Sol turns over the card: yuzu, mint, and pepper. Two out of three.",
      },
      {
        id: "rainlight-relay",
        kind: "publicEvent",
        eventId: "rainlight-relay",
        sourceId: "market",
        label: "Bank Market light",
        description:
          "Send one market lantern into the live Relay. No chat or matching is required.",
      },
    ],
  },
  {
    id: "resonance",
    name: "Resonance Garden",
    subtitle: "Music you build together.",
    position: [-4.8, 0, -14],
    color: "#c7a4ff",
    icon: "garden",
    npcId: "juno",
    blurb:
      "A sunken garden of responsive light. Each person adds one rhythm; the room makes something gentler and stranger from the overlap.",
    activities: [
      {
        id: "wake-rainlight",
        kind: "quest",
        questId: "afterlight-rainlight-rising",
        objectiveId: "wake-rainlight",
        label: "Wake the Rainlight Relay",
        description:
          "Touch the central beacon and open Juno's route across the district.",
        response:
          "The central basin answers with three threads of light: glasshouse green, market gold, and garden violet.",
      },
      {
        id: "lanternkeeper-expedition",
        kind: "expedition",
        expeditionId: "lanternkeeper-expedition",
        label: "Open the Lanternkeeper board",
        description:
          "Start or join an opt-in 2–4 traveler field party across all three districts. A solo Echo guide opens after 90 seconds.",
      },
      {
        id: "resonance-duet",
        kind: "cooperative",
        stationId: "resonance-duet",
        stationName: "Resonance Loom",
        label: "Tune the Resonance Loom",
        description:
          "Build a three-note light song with one person nearby. There is no score to beat and either person may leave.",
      },
      {
        id: "pulse",
        kind: "oneShot",
        label: "Add a pulse",
        description: "Leave one beat in tonight's shared loop.",
        response:
          "Your low, soft pulse folds under the melody. The garden answers in violet.",
      },
      {
        id: "rainlight-relay",
        kind: "publicEvent",
        eventId: "rainlight-relay",
        sourceId: "resonance",
        label: "Bank Garden light",
        description:
          "Add the garden's violet note to the live Relay. Two travelers finish faster; a solo Echo route opens after 90 seconds.",
      },
    ],
  },
];

export const NPCS = {
  sol: {
    name: "Sol",
    role: "Market host",
    color: "#ff8e9f",
    homeLandmarkId: "market",
    questIds: ["afterlight-sunthread"],
    greeting:
      "Sol slides a tiny cup across the counter. “Try first. Guess second.”",
    dialogue: [
      "Shared tables work better when nobody owns the whole conversation.",
      "Tonight's question is simple: what food tastes like home to you?",
      "Stay as long as it feels easy. Leaving kindly is always allowed here.",
    ],
    farewell: "“Take something warm for the walk.”",
  },
  juno: {
    name: "Juno",
    role: "Garden conductor",
    color: "#c7a4ff",
    homeLandmarkId: "resonance",
    questIds: [
      "afterlight-rainlight-rising",
      "afterlight-lanternkeeper-expedition",
    ],
    greeting:
      "Juno lowers one channel and the flowers dim with it. “Add something small.”",
    dialogue: [
      "Nobody gets the solo here. The loop only works because it belongs to the room.",
      "If words are hard tonight, pick a rhythm and let that be enough.",
      "Listening Hour starts at nine. The garden goes voice-free for one set.",
    ],
    farewell: "“Leave the beat. Take the feeling.”",
  },
};

export const AMBIENT_NPCS = [
  {
    id: "amb-1",
    color: "#de9b76",
    waypoints: [
      [5, 0, 5],
      [-6, 0, 7],
      [-8, 0, -2],
      [3, 0, -6],
    ],
    speed: 0.75,
  },
  {
    id: "amb-2",
    color: "#74c9db",
    waypoints: [
      [2, 0, 10],
      [10, 0, 2],
      [4, 0, -10],
      [-7, 0, -5],
    ],
    speed: 0.95,
  },
  {
    id: "amb-3",
    color: "#d6be72",
    waypoints: [
      [-4, 0, 2],
      [5, 0, -1],
      [7, 0, 8],
    ],
    speed: 0.68,
  },
  {
    id: "amb-4",
    color: "#86cfaa",
    waypoints: [
      [14, 0, 14],
      [-12, 0, 14],
      [-15, 0, -9],
      [11, 0, -13],
    ],
    speed: 0.84,
  },
  {
    id: "amb-5",
    color: "#d3a5e8",
    waypoints: [
      [-2, 0, 15],
      [-8, 0, 4],
      [1, 0, -12],
      [9, 0, 3],
    ],
    speed: 0.72,
  },
];

export const PLAZA_DECOR = {
  lanterns: [
    [0, 0, 6],
    [0, 0, -6],
    [6, 0, 0],
    [-6, 0, 0],
    [-10, 0, 5],
    [10, 0, 5],
    [-10, 0, -4],
    [10, 0, -4],
    [-6, 0, 15],
    [6, 0, 15],
    [-6, 0, -15],
    [6, 0, -15],
  ],
  benches: [
    [4, 5, -0.65],
    [-4, 5, 0.65],
    [5, -4, 1.4],
    [-5, -4, -1.4],
    [8, 12, 0.2],
    [-8, 11, -0.2],
  ],
  trees: [
    [17, -12],
    [-17, -12],
    [18, 9],
    [-18, 9],
    [8, -19],
    [-8, -19],
    [19, 0],
    [-19, 0],
    [8, 19],
    [-8, 19],
  ],
};

// Retained for backwards-compatible local saves while the old XP layer is
// retired from the interface in favor of a personal travel journal.
export function levelForXp(xp) {
  let level = 1;
  let cost = 50;
  let remaining = xp;
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = level * 50;
  }
  return { level, into: remaining, needed: cost };
}
