import React from "react";
import Select from "react-select";
import ReactSlider from "react-slider";
import { AGE_NO_LIMIT, DISTANCE_NO_LIMIT } from "../utils/geo";

function formatAgeRange(min, max) {
  const lo = min ?? 18;
  const hi = max ?? AGE_NO_LIMIT;
  return hi >= AGE_NO_LIMIT ? `${lo} – No limit` : `${lo} – ${hi}`;
}

function formatDistanceRange(min, max) {
  const lo = min ?? 0;
  const hi = max ?? DISTANCE_NO_LIMIT;
  return hi >= DISTANCE_NO_LIMIT
    ? lo > 0
      ? `${lo}+ mi (no upper limit)`
      : "No limit"
    : `${lo} – ${hi} mi`;
}

const religionOptions = [
  "Agnostic", "Atheist", "Buddhist",
  "Christian – Catholic", "Christian – Protestant", "Christian – Other",
  "Hindu", "Jewish", "Muslim", "Sikh",
  "Spiritual but not religious", "Pagan / Earth-based", "Taoist",
  "Unitarian Universalist", "No religion", "Other (please specify)",
].map((v) => ({ value: v, label: v }));

const raceOptions = [
  "Black or African American", "White", "Hispanic or Latino",
  "East Asian", "South Asian", "Southeast Asian",
  "Middle Eastern", "North African",
  "Native American or Alaska Native",
  "Native Hawaiian or Other Pacific Islander", "Jewish",
].map((v) => ({ value: v, label: v }));

const STRENGTH_LABELS = ["No preference", "Weak", "Strong", "Dealbreaker"];
const TRANS_ASEX_LABELS = ["Dealbreaker", "Prefer not", "No preference", "Prefer", "Necessary"];

const reactSelectStyles = {
  control: (base, state) => ({
    ...base,
    background: "rgba(7, 18, 14, 0.65)",
    borderColor: state.isFocused
      ? "var(--ds-amber)"
      : "rgba(255, 255, 255, 0.16)",
    borderRadius: "var(--ds-r-md)",
    minHeight: 46,
    boxShadow: state.isFocused ? "0 0 0 3px rgba(255, 184, 107, 0.18)" : "none",
    ":hover": { borderColor: "rgba(255, 184, 107, 0.4)" },
  }),
  valueContainer: (base) => ({ ...base, padding: "4px 8px" }),
  multiValue: (base) => ({
    ...base,
    background: "rgba(255, 184, 107, 0.18)",
    borderRadius: 999,
    padding: "0 4px",
  }),
  multiValueLabel: (base) => ({ ...base, color: "var(--ds-amber-2)", fontWeight: 500 }),
  multiValueRemove: (base) => ({
    ...base,
    color: "var(--ds-amber-2)",
    ":hover": { background: "rgba(255, 184, 107, 0.3)", color: "var(--ds-text)" },
  }),
  placeholder: (base) => ({ ...base, color: "rgba(244, 236, 216, 0.35)" }),
  input: (base) => ({ ...base, color: "var(--ds-text)" }),
  menu: (base) => ({
    ...base,
    background: "var(--ds-card)",
    border: "1px solid var(--ds-line)",
    borderRadius: "var(--ds-r-md)",
    overflow: "hidden",
    zIndex: 9999,
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    background: state.isFocused ? "var(--ds-amber-soft)" : "transparent",
    color: state.isFocused ? "var(--ds-amber-2)" : "var(--ds-text-soft)",
    padding: "10px 14px",
    cursor: "pointer",
  }),
};

function StrengthSlider({ value, onChange, labels = STRENGTH_LABELS }) {
  const max = labels.length - 1;
  return (
    <div className="step6-strength">
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value || 0}
        onChange={(e) => onChange(e.target.value)}
        className="ds-range"
      />
      <div className="step6-strength__scale">
        {labels.map((label, idx) => (
          <span
            key={label}
            className={`step6-strength__tick${(parseInt(value, 10) || 0) === idx ? " is-active" : ""}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function inchesToFeet(inches) {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function Section({ title, hint, children }) {
  return (
    <section className="step6-section">
      <div className="step6-section__head">
        <h3 className="step6-section__title">{title}</h3>
        {hint && <div className="step6-section__hint">{hint}</div>}
      </div>
      <div className="step6-section__body">{children}</div>
    </section>
  );
}

function Question({ label, children, value }) {
  return (
    <div className="step6-q">
      <div className="step6-q__row">
        <span className="step6-q__label">{label}</span>
        {value !== undefined && <span className="step6-q__value">{value}</span>}
      </div>
      <div className="step6-q__control">{children}</div>
    </div>
  );
}

export default function SignupStep6({ formData, setFormData, onNext, onBack, loading }) {
  const set = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="ds-card ds-card--wide">
      <div className="ds-card__eyebrow">Step 7 · Compatibility</div>
      <h1 className="ds-card__title">Fine-tune your matches</h1>
      <p className="ds-card__subtitle">
        Optional. These shape who you'll see — you can change any of it later from your profile.
      </p>

      <Section
        title="About you"
        hint="Help others find common ground."
      >
        <Question label="Your religion(s)">
          <Select
            isMulti
            options={religionOptions}
            styles={reactSelectStyles}
            placeholder="Pick any that apply…"
            value={religionOptions.filter((o) => formData.religions?.includes(o.value))}
            onChange={(sel) => set("religions", sel.map((s) => s.value))}
            menuPortalTarget={portalTarget}
          />
        </Question>

        <Question label="Your ethnicity(ies)">
          <Select
            isMulti
            options={raceOptions}
            styles={reactSelectStyles}
            placeholder="Pick any that apply…"
            value={raceOptions.filter((o) => formData.ethnicities?.includes(o.value))}
            onChange={(sel) => set("ethnicities", sel.map((s) => s.value))}
            menuPortalTarget={portalTarget}
          />
        </Question>

        <Question label="Your height" value={inchesToFeet(formData.selfHeight || 66)}>
          <ReactSlider
            className="range-slider range-slider--single"
            thumbClassName="range-thumb"
            trackClassName="range-track"
            min={48}
            max={84}
            step={1}
            value={formData.selfHeight || 66}
            onChange={(v) => set("selfHeight", v)}
          />
        </Question>

        <Question label="Do you identify as transgender?">
          <select
            className="ds-select"
            value={formData.isTrans || ""}
            onChange={(e) => set("isTrans", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Question>

        <Question label="Are you asexual?">
          <select
            className="ds-select"
            value={formData.isAsexual || ""}
            onChange={(e) => set("isAsexual", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Question>
      </Section>

      <Section
        title="Who you're looking for"
        hint="Set the broad strokes. Sliders mean 'how strict.'"
      >
        <Question label="Genders you're attracted to">
          <select
            className="ds-select"
            value={formData.genderPref || ""}
            onChange={(e) => set("genderPref", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
            <option value="all">All</option>
          </select>
          <div className="ds-field__hint">Nonbinary is automatically included.</div>
        </Question>

        {formData.genderPref === "all" && (
          <Question
            label="Lean toward…"
            value={[
              "Strongly women", "Prefer women", "Slight women",
              "No preference",
              "Slight men", "Prefer men", "Strongly men",
            ][parseInt(formData.genderScale || 0, 10) + 3]}
          >
            <input
              type="range"
              min={-3}
              max={3}
              step={1}
              value={formData.genderScale || 0}
              onChange={(e) => set("genderScale", e.target.value)}
              className="ds-range"
            />
          </Question>
        )}

        <Question
          label="Preferred age range"
          value={formatAgeRange(formData.ageMin, formData.ageMax)}
        >
          <ReactSlider
            className="range-slider range-slider--double"
            thumbClassName="range-thumb"
            trackClassName="range-track"
            min={18}
            max={AGE_NO_LIMIT}
            step={1}
            value={[formData.ageMin || 18, formData.ageMax || 35]}
            onChange={([min, max]) => {
              set("ageMin", min);
              set("ageMax", max);
            }}
          />
        </Question>

        <Question
          label="Preferred distance"
          value={formatDistanceRange(formData.distMin, formData.distMax)}
        >
          <ReactSlider
            className="range-slider range-slider--double"
            thumbClassName="range-thumb"
            trackClassName="range-track"
            min={0}
            max={DISTANCE_NO_LIMIT}
            step={1}
            value={[
              formData.distMin ?? 0,
              formData.distMax ?? DISTANCE_NO_LIMIT,
            ]}
            onChange={([min, max]) => {
              set("distMin", min);
              set("distMax", max);
            }}
          />
          <div className="ds-field__hint">
            Drag the right thumb all the way to set "No limit".
          </div>
        </Question>

        <Question label="Have a height preference?">
          <select
            className="ds-select"
            value={formData.hasHeightPref || ""}
            onChange={(e) => set("hasHeightPref", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Question>

        {formData.hasHeightPref === "yes" && (
          <>
            <Question
              label="Preferred height range"
              value={`${inchesToFeet(formData.heightMin || 60)} – ${inchesToFeet(formData.heightMax || 72)}`}
            >
              <ReactSlider
                className="range-slider range-slider--double"
                thumbClassName="range-thumb"
                trackClassName="range-track"
                min={48}
                max={84}
                step={1}
                value={[formData.heightMin || 60, formData.heightMax || 72]}
                onChange={([min, max]) => {
                  set("heightMin", min);
                  set("heightMax", max);
                }}
              />
            </Question>
            <Question label="How strict?">
              <StrengthSlider
                value={formData.heightDealbreaker || 0}
                onChange={(v) => set("heightDealbreaker", v)}
              />
            </Question>
          </>
        )}

        <Question label="Ethnicity preference?">
          <select
            className="ds-select"
            value={formData.hasEthnicityPref || ""}
            onChange={(e) => set("hasEthnicityPref", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Question>

        {formData.hasEthnicityPref === "yes" && (
          <>
            <Question label="Preferred ethnicity(ies)">
              <Select
                isMulti
                options={raceOptions}
                styles={reactSelectStyles}
                placeholder="Pick any that apply…"
                value={raceOptions.filter((o) => formData.ethnicityPreferences?.includes(o.value))}
                onChange={(sel) => set("ethnicityPreferences", sel.map((s) => s.value))}
                menuPortalTarget={portalTarget}
              />
            </Question>
            <Question label="How strict?">
              <StrengthSlider
                value={formData.ethnicityPrefStrength || 0}
                onChange={(v) => set("ethnicityPrefStrength", v)}
              />
            </Question>
          </>
        )}

        {formData.religions?.length > 0 && (
          <Question label="Different religion = dealbreaker?">
            <StrengthSlider
              value={formData.religionPref || 0}
              onChange={(v) => set("religionPref", v)}
            />
          </Question>
        )}

        {formData.isTrans && (
          <Question label="Preference for a transgender partner">
            <StrengthSlider
              value={formData.transPref || 2}
              onChange={(v) => set("transPref", v)}
              labels={TRANS_ASEX_LABELS}
            />
          </Question>
        )}

        {formData.isAsexual && (
          <Question label="Preference for an asexual partner">
            <StrengthSlider
              value={formData.asexualPref || 2}
              onChange={(v) => set("asexualPref", v)}
              labels={TRANS_ASEX_LABELS}
            />
          </Question>
        )}
      </Section>

      <Section
        title="Lifestyle"
        hint="How much should these align with yours?"
      >
        <Question label="Substance use">
          <select
            className="ds-select"
            value={formData.substances || ""}
            onChange={(e) => set("substances", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="none">Don't use</option>
            <option value="socially">Socially / occasionally</option>
            <option value="frequent">Frequently</option>
          </select>
        </Question>
        <Question label="Should partner match?">
          <StrengthSlider
            value={formData.substancePref || 0}
            onChange={(v) => set("substancePref", v)}
          />
        </Question>

        <Question label="Want children?">
          <select
            className="ds-select"
            value={formData.children || ""}
            onChange={(e) => set("children", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="yes">Yes</option>
            <option value="later">Later</option>
            <option value="no">No</option>
            <option value="undecided">Undecided</option>
          </select>
        </Question>
        <Question label="Should partner match?">
          <StrengthSlider
            value={formData.childrenPref || 0}
            onChange={(v) => set("childrenPref", v)}
          />
        </Question>

        <Question label="Political alignment">
          <select
            className="ds-select"
            value={formData.politics || ""}
            onChange={(e) => set("politics", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="apolitical">Apolitical</option>
          </select>
        </Question>
        <Question label="Should partner match?">
          <StrengthSlider
            value={formData.politicsPref || 0}
            onChange={(v) => set("politicsPref", v)}
          />
        </Question>
      </Section>

      <div className="ds-btn-row">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={onBack} disabled={loading}>
          Back
        </button>
        <button type="button" className="ds-btn ds-btn--primary" onClick={onNext} disabled={loading}>
          {loading ? "Working…" : "Finish signup"}
        </button>
      </div>
    </div>
  );
}
