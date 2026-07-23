export const SOCIAL_CHOICE_IDS = Object.freeze(["a", "b", "c", "pass"]);

const CHOICE_IDS = new Set(SOCIAL_CHOICE_IDS);

export const LISTENING_CARDS = Object.freeze([
  {
    id: "open-evening",
    kicker: "A free evening",
    prompt: "A free evening opens up. Where does your energy go?",
    choices: [
      { id: "a", label: "Somewhere new, with no fixed plan" },
      { id: "b", label: "A familiar place with good food" },
      { id: "c", label: "Home, making something together" },
    ],
  },
  {
    id: "easy-conversation",
    kicker: "When the talking gets easy",
    prompt: "What makes you want to stay in a conversation a little longer?",
    choices: [
      { id: "a", label: "A story I did not expect" },
      { id: "b", label: "A silence that feels comfortable" },
      { id: "c", label: "A question neither of us planned" },
    ],
  },
  {
    id: "small-care",
    kicker: "Care in the details",
    prompt: "Which small gesture feels most like care to you?",
    choices: [
      { id: "a", label: "Remembering a tiny detail" },
      { id: "b", label: "Making an ordinary day easier" },
      { id: "c", label: "Showing up with something funny" },
    ],
  },
  {
    id: "tiny-adventure",
    kicker: "Two hours, no itinerary",
    prompt: "Pick a tiny adventure for an open afternoon.",
    choices: [
      { id: "a", label: "Follow a street we have never taken" },
      { id: "b", label: "Cook with one mystery ingredient" },
      { id: "c", label: "Find the best view before sunset" },
    ],
  },
  {
    id: "after-a-long-week",
    kicker: "A softer landing",
    prompt: "After a long week, what kind of company sounds right?",
    choices: [
      { id: "a", label: "Quiet, side by side" },
      { id: "b", label: "A lively place and shared snacks" },
      { id: "c", label: "A walk that becomes a long talk" },
    ],
  },
  {
    id: "slow-curiosity",
    kicker: "Worth learning slowly",
    prompt: "What are you happiest to discover about someone over time?",
    choices: [
      { id: "a", label: "What makes them laugh for real" },
      { id: "b", label: "What they care for when no one sees" },
      { id: "c", label: "How they imagine a good life" },
    ],
  },
]);

export const LISTENING_CARD_IDS = Object.freeze(
  LISTENING_CARDS.map((card) => card.id),
);

const CARDS_BY_ID = new Map(
  LISTENING_CARDS.map((card) => [card.id, card]),
);

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function socialCardIdForMatchId(matchId) {
  const seed = String(matchId || "listening-crescent");
  return LISTENING_CARDS[hashText(seed) % LISTENING_CARDS.length].id;
}

export function listeningCardFor(matchOrId) {
  if (matchOrId && typeof matchOrId === "object") {
    if (matchOrId.socialCardId) {
      return CARDS_BY_ID.get(matchOrId.socialCardId) || null;
    }
    return CARDS_BY_ID.get(socialCardIdForMatchId(matchOrId.id));
  }
  return CARDS_BY_ID.get(socialCardIdForMatchId(matchOrId));
}

export function safeSocialChoiceId(value) {
  return CHOICE_IDS.has(value) ? value : null;
}

export function socialChoiceLabel(card, choiceId) {
  if (choiceId === "pass") return "Pass this card";
  return card?.choices?.find((choice) => choice.id === choiceId)?.label || null;
}

export function socialMomentOutcome(match, myUid, choices) {
  if (!match?.id || !myUid || !choices || typeof choices !== "object") {
    return null;
  }
  const participantIds = [match.white, match.black].filter(Boolean);
  if (participantIds.length !== 2 || !participantIds.includes(myUid)) {
    return null;
  }
  const opponentUid = participantIds.find((uid) => uid !== myUid);
  const myChoice = choices[myUid];
  const opponentChoice = choices[opponentUid];
  const myChoiceId =
    myChoice?.matchId === match.id
      ? safeSocialChoiceId(myChoice.choiceId)
      : null;
  const opponentChoiceId =
    opponentChoice?.matchId === match.id
      ? safeSocialChoiceId(opponentChoice.choiceId)
      : null;
  const card = listeningCardFor(match);
  if (!card) return null;
  const passed = myChoiceId === "pass" || opponentChoiceId === "pass";
  if (!passed && (!myChoiceId || !opponentChoiceId)) return null;
  return {
    matchId: match.id,
    card,
    myUid,
    opponentUid,
    myChoiceId,
    opponentChoiceId,
    myChoiceLabel: socialChoiceLabel(card, myChoiceId),
    opponentChoiceLabel: socialChoiceLabel(card, opponentChoiceId),
    sameChoice: !passed && myChoiceId === opponentChoiceId,
    passed,
    completed: !passed,
  };
}
