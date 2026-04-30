// Pure layout/content data for Ember Plaza. No React, no three.

export const PLAZA_RADIUS = 18;
export const INTERACTION_RADIUS = 2.6;
export const INTERACTION_RELEASE = 3.1;

// Each NPC has a finite conversation arc.
// Activities are tagged: "dialog" advances the conversation by one beat,
// "oneShot" can only fire once per session, "minigame" hands off to the lobby,
// "emote" is replayable.
export const LANDMARKS = [
  {
    id: "fountain",
    name: "Wishing Fountain",
    subtitle: "Make a small wish.",
    position: [0, 0, 0],
    color: "#8ad6c6",
    icon: "fountain",
    blurb:
      "A bowl of pale water lit from below. People drop a coin and trade a sentence with whoever is standing nearby.",
    activities: [
      {
        id: "wish",
        kind: "oneShot",
        label: "Make a wish",
        description: "+1 spark on your next encounter.",
        response: "You drop a wish into the bowl. Something settles in your chest.",
        xp: 5,
      },
      {
        id: "watch",
        kind: "oneShot",
        label: "Watch the water",
        description: "Wait a moment, see who walks up.",
        response: "You watch the water. Two strangers nod and walk on.",
        xp: 3,
      },
    ],
  },
  {
    id: "chess",
    name: "Lantern Pavilion",
    subtitle: "Mira is at the board.",
    position: [-9, 0, -7],
    color: "#f5c973",
    icon: "chess",
    npcId: "mira",
    blurb:
      "A round table under a paper lantern. Mira leans on her elbows, half-watching, half-waiting for a real game.",
    activities: [
      {
        id: "chess",
        kind: "minigame",
        stationId: "chess",
        label: "Sit at the chess board",
        description: "Wait for another player, or play Mira.",
        xp: 20,
      },
    ],
  },
  {
    id: "coffee",
    name: "Lantern Cart",
    subtitle: "Ivy is brewing.",
    position: [10, 0, -5],
    color: "#f19bb8",
    icon: "coffee",
    npcId: "ivy",
    blurb:
      "A little cart strung with bulbs, smelling like cardamom and orange peel. Ivy slides drinks across without ever rushing.",
    activities: [
      {
        id: "order",
        kind: "oneShot",
        label: "Order something warm",
        description: "Cardamom + orange peel.",
        response: "Ivy slides a steaming cup over. \"On the house. Don't tell anyone.\"",
        xp: 8,
      },
    ],
  },
  {
    id: "lookout",
    name: "Lakeside Deck",
    subtitle: "Rowan is watching the water.",
    position: [8, 0, 9],
    color: "#99b4ff",
    icon: "stars",
    npcId: "rowan",
    blurb:
      "A wooden deck reaches out over the lake. Rowan is at the railing, hands in pockets, easy to stand next to in silence.",
    activities: [
      {
        id: "skip",
        kind: "oneShot",
        label: "Skip stones",
        description: "Small game, big tells.",
        response: "You manage four skips. Rowan just nods. That's high praise.",
        xp: 8,
      },
    ],
  },
  {
    id: "dance",
    name: "Lantern Circle",
    subtitle: "Juno is spinning records.",
    position: [-10, 0, 8],
    color: "#d9b0ff",
    icon: "music",
    npcId: "juno",
    blurb:
      "Strings of orange lights ring a patch of stone. Juno is on a crate behind a small mixer, head bobbing.",
    activities: [
      {
        id: "request",
        kind: "oneShot",
        label: "Request a song",
        description: "Tell Juno your vibe.",
        response: "Juno catches it on the next change. \"Good ear. Stick around.\"",
        xp: 8,
      },
    ],
  },
];

export const NPCS = {
  mira: {
    name: "Mira",
    role: "Arcade host",
    color: "#f5c973",
    homeLandmarkId: "chess",
    greeting: "Mira looks up. \"Took you long enough.\"",
    dialogue: [
      "You came back to the board. Good.",
      "Most people open with a knight. You waiting for me to commit?",
      "I keep score in my head. Just so you know.",
      "Anyone you want to bring next time? I play teams.",
    ],
    farewell: "\"Come back when you're ready to lose less politely.\"",
  },
  ivy: {
    name: "Ivy",
    role: "Cart keeper",
    color: "#f19bb8",
    homeLandmarkId: "coffee",
    greeting: "Ivy looks up from a cup. \"Hey you.\"",
    dialogue: [
      "First time? I'd start with the cardamom one.",
      "You look like you've been walking all night.",
      "Tell me one good thing that happened today.",
      "I see who comes by twice. You count.",
    ],
    farewell: "\"Come back later. I'll make a stronger one.\"",
  },
  rowan: {
    name: "Rowan",
    role: "Route keeper",
    color: "#99b4ff",
    homeLandmarkId: "lookout",
    greeting: "Rowan glances over. \"Hey.\"",
    dialogue: [
      "It's a good lake tonight.",
      "I notice who keeps showing up. You're getting easier to recognize.",
      "I don't really do small talk. But I'm here.",
      "If you want quiet, this is the spot. Welcome.",
    ],
    farewell: "\"Catch you on the next loop.\"",
  },
  juno: {
    name: "Juno",
    role: "DJ",
    color: "#d9b0ff",
    homeLandmarkId: "dance",
    greeting: "Juno raises a hand. \"Yo.\"",
    dialogue: [
      "First request gets played twice.",
      "You move like you can keep a beat. That's all I need.",
      "Stay for the next track. Trust me.",
      "If you bring a friend, the floor opens up.",
    ],
    farewell: "\"Catch the next set.\"",
  },
};

// Wandering ambient NPCs. They drift between points; not interactive.
export const AMBIENT_NPCS = [
  { id: "amb-1", color: "#b78a68", waypoints: [[5, 0, 5], [-5, 0, 5], [-5, 0, -5], [5, 0, -5]], speed: 0.85 },
  { id: "amb-2", color: "#7bb7d7", waypoints: [[0, 0, 7], [7, 0, 0], [0, 0, -7], [-7, 0, 0]], speed: 1.05 },
  { id: "amb-3", color: "#c9a66b", waypoints: [[-3, 0, 3], [3, 0, -3]], speed: 0.7 },
  { id: "amb-4", color: "#a3c89e", waypoints: [[12, 0, 12], [-12, 0, 12], [-12, 0, -12], [12, 0, -12]], speed: 0.95 },
];

export const PLAZA_DECOR = {
  lanterns: [
    [0, 0, 5.5],
    [0, 0, -5.5],
    [5.5, 0, 0],
    [-5.5, 0, 0],
    [-9, 0, 9],
    [9, 0, -9],
  ],
  benches: [
    [3.5, 4, 0],
    [-3.5, 4, Math.PI],
    [4, -3.5, Math.PI / 2],
    [-4, -3.5, -Math.PI / 2],
  ],
  trees: [
    [13, -10],
    [-13, -10],
    [13, 10],
    [-13, 10],
    [0, -14],
    [0, 14],
    [14, 0],
    [-14, 0],
  ],
};

// XP curve: level N requires N * 50 XP.
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
