import { fireEvent, render, screen } from "@testing-library/react";
import AvatarStudio from "./AvatarStudio";
import {
  AVATAR_APPEARANCE_VERSION,
  DEFAULT_AVATAR_APPEARANCE,
} from "../../game/avatarAppearance";

function renderStudio(overrides = {}) {
  const props = {
    appearance: DEFAULT_AVATAR_APPEARANCE,
    unlockedCosmetics: [],
    onSave: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  return { ...render(<AvatarStudio {...props} />), props };
}

describe("AvatarStudio", () => {
  it("uses native groups and states the current one-hairstyle limit", () => {
    renderStudio();

    expect(screen.getByRole("group", { name: "Frame" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Skin tone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Hairstyle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one hairstyle is available in this build/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Asymmetric bob" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Warm ochre" }),
    ).toBeChecked();
  });

  it("saves a hydrated draft after several catalog choices change", () => {
    const onSave = jest.fn();
    renderStudio({ onSave });

    fireEvent.click(screen.getByRole("radio", { name: "Broad" }));
    fireEvent.click(screen.getByRole("radio", { name: "Deep umber" }));
    fireEvent.click(screen.getByRole("radio", { name: "Copper" }));
    fireEvent.click(screen.getByRole("radio", { name: "Garden Glass" }));
    fireEvent.click(screen.getByRole("radio", { name: "No scarf" }));
    fireEvent.click(screen.getByRole("radio", { name: "No fittings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save avatar" }));

    expect(onSave).toHaveBeenCalledWith({
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
  });

  it("explains and disables the locked authored quest rewards", () => {
    renderStudio();

    expect(
      screen.getByRole("radio", { name: /Sunthread scarf · Locked/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Complete The Sunthread Signal to unlock this scarf.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Rainlight scarf · Locked/i }),
    ).toBeDisabled();
    expect(
      screen.getByText("Complete Rainlight Rising to unlock this scarf."),
    ).toBeInTheDocument();
  });

  it("allows an unlocked Sunthread scarf to be equipped and supports cancel", () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    renderStudio({
      unlockedCosmetics: ["cosmetic:scarf:sunthread"],
      onSave,
      onCancel,
    });

    const sunthread = screen.getByRole("radio", {
      name: "Sunthread scarf",
    });
    expect(sunthread).toBeEnabled();
    fireEvent.click(sunthread);
    fireEvent.click(screen.getByRole("button", { name: "Save avatar" }));
    expect(onSave.mock.calls[0][0].outfit.trim).toBe("sunthread");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables editing while a save is in progress and announces errors", () => {
    renderStudio({ saving: true, error: "Avatar changes did not save." });

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Avatar changes did not save.",
    );
  });
});
