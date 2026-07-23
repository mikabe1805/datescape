export const AVATAR_APPEARANCE_VERSION = 1;

export const AVATAR_FRAME_OPTIONS = Object.freeze([
  { id: "narrow", label: "Narrow" },
  { id: "balanced", label: "Balanced" },
  { id: "broad", label: "Broad" },
]);

export const AVATAR_SKIN_TONE_OPTIONS = Object.freeze([
  { id: "deep-umber", label: "Deep umber", color: "#5b2f24" },
  { id: "rich-sienna", label: "Rich sienna", color: "#81503b" },
  { id: "warm-ochre", label: "Warm ochre", color: "#ad7657" },
  { id: "golden-sand", label: "Golden sand", color: "#d2a17a" },
  { id: "light-almond", label: "Light almond", color: "#ebc6a7" },
]);

export const AVATAR_HAIR_STYLE_OPTIONS = Object.freeze([
  { id: "asymmetric-bob", label: "Asymmetric bob" },
]);

export const AVATAR_HAIR_COLOR_OPTIONS = Object.freeze([
  { id: "blue-black", label: "Blue black", color: "#13272d" },
  { id: "espresso", label: "Espresso", color: "#38241f" },
  { id: "chestnut", label: "Chestnut", color: "#71442f" },
  { id: "copper", label: "Copper", color: "#a65d3f" },
]);

export const AVATAR_OUTFIT_PALETTE_OPTIONS = Object.freeze([
  {
    id: "pearl-tide",
    label: "Pearl Tide",
    swatches: ["#aebabb", "#298c8f", "#0e2530"],
  },
  {
    id: "coral-dusk",
    label: "Coral Dusk",
    swatches: ["#c99082", "#7e3f50", "#241d2e"],
  },
  {
    id: "garden-glass",
    label: "Garden Glass",
    swatches: ["#9ab9a8", "#236c62", "#112c2b"],
  },
]);

export const AVATAR_TRIM_OPTIONS = Object.freeze([
  { id: "accent", label: "Aura scarf", cosmeticId: null },
  { id: "minimal", label: "No scarf", cosmeticId: null },
  {
    id: "sunthread",
    label: "Sunthread scarf",
    cosmeticId: "cosmetic:scarf:sunthread",
    unlockLabel: "The Sunthread Signal",
  },
  {
    id: "rainlight",
    label: "Rainlight scarf",
    cosmeticId: "cosmetic:scarf:rainlight",
    unlockLabel: "Rainlight Rising",
  },
]);

export const AVATAR_ACCESSORY_OPTIONS = Object.freeze([
  { id: "aged-bronze-fittings", label: "Bronze fittings", cosmeticId: null },
  { id: "none", label: "No fittings", cosmeticId: null },
  {
    id: "lanternkeeper-charm",
    label: "Lanternkeeper charm",
    cosmeticId: "cosmetic:charm:lanternkeeper",
    unlockLabel: "The Lanternkeeper Expedition",
  },
]);

export const DEFAULT_AVATAR_APPEARANCE = Object.freeze({
  v: AVATAR_APPEARANCE_VERSION,
  frame: "balanced",
  skinTone: "warm-ochre",
  hairStyle: "asymmetric-bob",
  hairColor: "blue-black",
  outfit: Object.freeze({
    base: "promenade-v1",
    palette: "pearl-tide",
    trim: "accent",
  }),
  accessory: "aged-bronze-fittings",
});

const FRAME_IDS = new Set(AVATAR_FRAME_OPTIONS.map(({ id }) => id));
const SKIN_TONE_IDS = new Set(
  AVATAR_SKIN_TONE_OPTIONS.map(({ id }) => id),
);
const HAIR_STYLE_IDS = new Set(
  AVATAR_HAIR_STYLE_OPTIONS.map(({ id }) => id),
);
const HAIR_COLOR_IDS = new Set(
  AVATAR_HAIR_COLOR_OPTIONS.map(({ id }) => id),
);
const OUTFIT_PALETTE_IDS = new Set(
  AVATAR_OUTFIT_PALETTE_OPTIONS.map(({ id }) => id),
);
const TRIM_IDS = new Set(AVATAR_TRIM_OPTIONS.map(({ id }) => id));
const ACCESSORY_IDS = new Set(
  AVATAR_ACCESSORY_OPTIONS.map(({ id }) => id),
);

function allowed(value, ids, fallback) {
  return typeof value === "string" && ids.has(value) ? value : fallback;
}

export function hydrateAvatarAppearance(value) {
  const appearance = value && typeof value === "object" ? value : {};
  const outfit =
    appearance.outfit && typeof appearance.outfit === "object"
      ? appearance.outfit
      : {};
  return {
    v: AVATAR_APPEARANCE_VERSION,
    frame: allowed(
      appearance.frame,
      FRAME_IDS,
      DEFAULT_AVATAR_APPEARANCE.frame,
    ),
    skinTone: allowed(
      appearance.skinTone,
      SKIN_TONE_IDS,
      DEFAULT_AVATAR_APPEARANCE.skinTone,
    ),
    hairStyle: allowed(
      appearance.hairStyle,
      HAIR_STYLE_IDS,
      DEFAULT_AVATAR_APPEARANCE.hairStyle,
    ),
    hairColor: allowed(
      appearance.hairColor,
      HAIR_COLOR_IDS,
      DEFAULT_AVATAR_APPEARANCE.hairColor,
    ),
    outfit: {
      base: "promenade-v1",
      palette: allowed(
        outfit.palette,
        OUTFIT_PALETTE_IDS,
        DEFAULT_AVATAR_APPEARANCE.outfit.palette,
      ),
      trim: allowed(
        outfit.trim,
        TRIM_IDS,
        DEFAULT_AVATAR_APPEARANCE.outfit.trim,
      ),
    },
    accessory: allowed(
      appearance.accessory,
      ACCESSORY_IDS,
      DEFAULT_AVATAR_APPEARANCE.accessory,
    ),
  };
}

// Presence and the renderer receive equipped catalog IDs only. Inventory and
// unlock eligibility remain private progression data.
export function publicAvatarAppearance(value) {
  return hydrateAvatarAppearance(value);
}

export function avatarAppearanceSignature(value) {
  const safe = hydrateAvatarAppearance(value);
  return [
    safe.v,
    safe.frame,
    safe.skinTone,
    safe.hairStyle,
    safe.hairColor,
    safe.outfit.base,
    safe.outfit.palette,
    safe.outfit.trim,
    safe.accessory,
  ].join(":");
}

export function trimIsUnlocked(trimId, unlockedCosmetics = []) {
  const option = AVATAR_TRIM_OPTIONS.find(({ id }) => id === trimId);
  if (!option) return false;
  return (
    !option.cosmeticId ||
    (Array.isArray(unlockedCosmetics) &&
      unlockedCosmetics.includes(option.cosmeticId))
  );
}

export function accessoryIsUnlocked(accessoryId, unlockedCosmetics = []) {
  const option = AVATAR_ACCESSORY_OPTIONS.find(
    ({ id }) => id === accessoryId,
  );
  if (!option) return false;
  return (
    !option.cosmeticId ||
    (Array.isArray(unlockedCosmetics) &&
      unlockedCosmetics.includes(option.cosmeticId))
  );
}
