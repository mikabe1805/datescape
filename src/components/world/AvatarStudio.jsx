import { useId, useState } from "react";
import {
  AVATAR_ACCESSORY_OPTIONS,
  AVATAR_FRAME_OPTIONS,
  AVATAR_HAIR_COLOR_OPTIONS,
  AVATAR_HAIR_STYLE_OPTIONS,
  AVATAR_OUTFIT_PALETTE_OPTIONS,
  AVATAR_SKIN_TONE_OPTIONS,
  AVATAR_TRIM_OPTIONS,
  accessoryIsUnlocked,
  hydrateAvatarAppearance,
  publicAvatarAppearance,
  trimIsUnlocked,
} from "../../game/avatarAppearance";

export default function AvatarStudio({
  appearance,
  unlockedCosmetics = [],
  saving = false,
  error = null,
  onSave,
  onCancel,
}) {
  const [draft, setDraft] = useState(() => hydrateAvatarAppearance(appearance));
  const controlId = useId();
  const trimUnlocked = trimIsUnlocked(
    draft.outfit.trim,
    unlockedCosmetics,
  );
  const accessoryUnlocked = accessoryIsUnlocked(
    draft.accessory,
    unlockedCosmetics,
  );

  const updateField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateOutfit = (field, value) => {
    setDraft((current) => ({
      ...current,
      outfit: { ...current.outfit, [field]: value },
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimUnlocked || !accessoryUnlocked || typeof onSave !== "function") {
      return;
    }
    onSave(publicAvatarAppearance(draft));
  };

  return (
    <section
      className="world-avatar-studio"
      aria-labelledby={`${controlId}-title`}
      aria-busy={saving || undefined}
    >
      <header className="world-avatar-studio__header">
        <span className="world-avatar-studio__eyebrow">Your wayfarer</span>
        <h2 id={`${controlId}-title`}>Avatar studio</h2>
        <p>
          Shape how you appear in the shared world. These choices never change
          your dating profile.
        </p>
      </header>

      <form className="world-avatar-studio__form" onSubmit={handleSubmit}>
        <fieldset disabled={saving}>
          <legend>Frame</legend>
          <p className="world-avatar-studio__field-note">
            Every frame uses the same movement and activity rig.
          </p>
          <div className="world-avatar-studio__options">
            {AVATAR_FRAME_OPTIONS.map((option) => {
              const id = `${controlId}-frame-${option.id}`;
              return (
                <label key={option.id} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name={`${controlId}-frame`}
                    value={option.id}
                    checked={draft.frame === option.id}
                    onChange={() => updateField("frame", option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Skin tone</legend>
          <div className="world-avatar-studio__options world-avatar-studio__options--swatches">
            {AVATAR_SKIN_TONE_OPTIONS.map((option) => {
              const id = `${controlId}-skin-${option.id}`;
              return (
                <label key={option.id} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name={`${controlId}-skin-tone`}
                    value={option.id}
                    checked={draft.skinTone === option.id}
                    onChange={() => updateField("skinTone", option.id)}
                  />
                  <span
                    className="world-avatar-studio__swatch"
                    style={{ "--avatar-swatch": option.color }}
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Hairstyle</legend>
          <p className="world-avatar-studio__field-note">
            One hairstyle is available in this build. More styles will use the
            same shared rig.
          </p>
          <div className="world-avatar-studio__options">
            {AVATAR_HAIR_STYLE_OPTIONS.map((option) => {
              const id = `${controlId}-hair-style-${option.id}`;
              return (
                <label key={option.id} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name={`${controlId}-hair-style`}
                    value={option.id}
                    checked={draft.hairStyle === option.id}
                    onChange={() => updateField("hairStyle", option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Hair color</legend>
          <div className="world-avatar-studio__options world-avatar-studio__options--swatches">
            {AVATAR_HAIR_COLOR_OPTIONS.map((option) => {
              const id = `${controlId}-hair-color-${option.id}`;
              return (
                <label key={option.id} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name={`${controlId}-hair-color`}
                    value={option.id}
                    checked={draft.hairColor === option.id}
                    onChange={() => updateField("hairColor", option.id)}
                  />
                  <span
                    className="world-avatar-studio__swatch"
                    style={{ "--avatar-swatch": option.color }}
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Outfit palette</legend>
          <div className="world-avatar-studio__options world-avatar-studio__options--palettes">
            {AVATAR_OUTFIT_PALETTE_OPTIONS.map((option) => {
              const id = `${controlId}-palette-${option.id}`;
              return (
                <label key={option.id} htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name={`${controlId}-outfit-palette`}
                    value={option.id}
                    checked={draft.outfit.palette === option.id}
                    onChange={() => updateOutfit("palette", option.id)}
                  />
                  <span
                    className="world-avatar-studio__palette"
                    aria-hidden="true"
                  >
                    {option.swatches.map((color) => (
                      <span
                        key={color}
                        style={{ "--avatar-swatch": color }}
                      />
                    ))}
                  </span>
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Scarf and trim</legend>
          <div className="world-avatar-studio__options">
            {AVATAR_TRIM_OPTIONS.map((option) => {
              const id = `${controlId}-trim-${option.id}`;
              const unlocked = trimIsUnlocked(option.id, unlockedCosmetics);
              const helpId = option.cosmeticId ? `${id}-help` : undefined;
              return (
                <div
                  key={option.id}
                  className={`world-avatar-studio__trim${unlocked ? "" : " is-locked"}`}
                >
                  <label htmlFor={id}>
                    <input
                      id={id}
                      type="radio"
                      name={`${controlId}-outfit-trim`}
                      value={option.id}
                      checked={draft.outfit.trim === option.id}
                      disabled={!unlocked}
                      aria-describedby={helpId}
                      onChange={() => updateOutfit("trim", option.id)}
                    />
                    <span>
                      {option.label}
                      {!unlocked ? " · Locked" : ""}
                    </span>
                  </label>
                  {option.cosmeticId && (
                    <small id={helpId}>
                      {unlocked
                        ? `Unlocked through ${option.unlockLabel || "world play"}.`
                        : `Complete ${option.unlockLabel || "its world quest"} to unlock this scarf.`}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={saving}>
          <legend>Fittings and charms</legend>
          <p className="world-avatar-studio__field-note">
            Expedition rewards are visual keepsakes only. They never change
            movement, access, or social visibility.
          </p>
          <div className="world-avatar-studio__options">
            {AVATAR_ACCESSORY_OPTIONS.map((option) => {
              const id = `${controlId}-accessory-${option.id}`;
              const unlocked = accessoryIsUnlocked(
                option.id,
                unlockedCosmetics,
              );
              const helpId = option.cosmeticId ? `${id}-help` : undefined;
              return (
                <div
                  key={option.id}
                  className={`world-avatar-studio__trim${unlocked ? "" : " is-locked"}`}
                >
                  <label htmlFor={id}>
                    <input
                      id={id}
                      type="radio"
                      name={`${controlId}-accessory`}
                      value={option.id}
                      checked={draft.accessory === option.id}
                      disabled={!unlocked}
                      aria-describedby={helpId}
                      onChange={() => updateField("accessory", option.id)}
                    />
                    <span>
                      {option.label}
                      {!unlocked ? " · Locked" : ""}
                    </span>
                  </label>
                  {option.cosmeticId && (
                    <small id={helpId}>
                      {unlocked
                        ? `Unlocked through ${option.unlockLabel || "world play"}.`
                        : `Complete ${option.unlockLabel || "its world quest"} to unlock this charm.`}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p className="world-avatar-studio__error" role="alert">
            {error}
          </p>
        )}

        <div className="world-avatar-studio__actions">
          <button
            type="button"
            className="world-avatar-studio__cancel"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="world-avatar-studio__save"
            disabled={
              saving ||
              !trimUnlocked ||
              !accessoryUnlocked ||
              typeof onSave !== "function"
            }
          >
            {saving ? "Saving…" : "Save avatar"}
          </button>
        </div>
      </form>
    </section>
  );
}
