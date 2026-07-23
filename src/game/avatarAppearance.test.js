import {
  AVATAR_APPEARANCE_VERSION,
  DEFAULT_AVATAR_APPEARANCE,
  accessoryIsUnlocked,
  avatarAppearanceSignature,
  hydrateAvatarAppearance,
  publicAvatarAppearance,
  trimIsUnlocked,
} from "./avatarAppearance";

describe("avatar appearance", () => {
  it("hydrates absent and malformed values to a stable catalog default", () => {
    expect(hydrateAvatarAppearance(null)).toEqual(DEFAULT_AVATAR_APPEARANCE);
    expect(
      hydrateAvatarAppearance({
        v: 999,
        frame: "giant",
        skinTone: "#ffffff",
        hairStyle: "invented",
        hairColor: "rainbow",
        outfit: { base: "admin", palette: "raw", trim: "paid" },
      }),
    ).toEqual(DEFAULT_AVATAR_APPEARANCE);
  });

  it("keeps only supported public IDs and strips raw/private fields", () => {
    const value = publicAvatarAppearance({
      frame: "broad",
      skinTone: "deep-umber",
      hairStyle: "asymmetric-bob",
      hairColor: "copper",
      outfit: {
        base: "anything",
        palette: "garden-glass",
        trim: "minimal",
        inventory: ["private"],
      },
      accessory: "none",
      rawSkinColor: "#123456",
      unlocks: ["private"],
    });

    expect(value).toEqual({
      v: AVATAR_APPEARANCE_VERSION,
      frame: "broad",
      skinTone: "deep-umber",
      hairStyle: "asymmetric-bob",
      hairColor: "copper",
      outfit: {
        base: "promenade-v1",
        palette: "garden-glass",
        trim: "minimal",
      },
      accessory: "none",
    });
    expect(JSON.stringify(value)).not.toMatch(/inventory|unlocks|rawSkinColor/);
  });

  it("makes a deterministic change signature", () => {
    const first = avatarAppearanceSignature(DEFAULT_AVATAR_APPEARANCE);
    const second = avatarAppearanceSignature({
      ...DEFAULT_AVATAR_APPEARANCE,
      hairColor: "espresso",
    });
    expect(first).not.toBe(second);
    expect(avatarAppearanceSignature({})).toBe(first);
  });

  it("keeps the quest cosmetic locked until its private unlock is present", () => {
    expect(trimIsUnlocked("accent", [])).toBe(true);
    expect(trimIsUnlocked("sunthread", [])).toBe(false);
    expect(
      trimIsUnlocked("sunthread", ["cosmetic:scarf:sunthread"]),
    ).toBe(true);
    expect(trimIsUnlocked("rainlight", [])).toBe(false);
    expect(
      trimIsUnlocked("rainlight", ["cosmetic:scarf:rainlight"]),
    ).toBe(true);
    expect(trimIsUnlocked("not-real", ["cosmetic:scarf:sunthread"])).toBe(
      false,
    );
    expect(accessoryIsUnlocked("aged-bronze-fittings", [])).toBe(true);
    expect(accessoryIsUnlocked("lanternkeeper-charm", [])).toBe(false);
    expect(
      accessoryIsUnlocked("lanternkeeper-charm", [
        "cosmetic:charm:lanternkeeper",
      ]),
    ).toBe(true);
    expect(accessoryIsUnlocked("invented", [])).toBe(false);
  });
});
