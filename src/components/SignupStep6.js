// FULL MASTER STEP 6 FILE — FULLY INTEGRATED
import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import ReactSlider from 'react-slider';
import '../styles.css';

export default function Step6Compatibility({ formData, setFormData, onNext, onBack }) {
  const [scrollRef, setScrollRef] = useState(null);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const religionOptions = [
    { value: "Agnostic", label: "Agnostic" },
    { value: "Atheist", label: "Atheist" },
    { value: "Buddhist", label: "Buddhist" },
    { value: "Christian – Catholic", label: "Christian – Catholic" },
    { value: "Christian – Protestant", label: "Christian – Protestant" },
    { value: "Christian – Other", label: "Christian – Other" },
    { value: "Hindu", label: "Hindu" },
    { value: "Jewish", label: "Jewish" },
    { value: "Muslim", label: "Muslim" },
    { value: "Sikh", label: "Sikh" },
    { value: "Spiritual but not religious", label: "Spiritual but not religious" },
    { value: "Pagan / Earth-based", label: "Pagan / Earth-based" },
    { value: "Taoist", label: "Taoist" },
    { value: "Unitarian Universalist", label: "Unitarian Universalist" },
    { value: "No religion", label: "No religion" },
    { value: "Other (please specify)", label: "Other (please specify)" }
  ];

  const raceOptions = [
    { value: "Black or African American", label: "Black or African American" },
    { value: "White", label: "White" },
    { value: "Hispanic or Latino", label: "Hispanic or Latino" },
    { value: "East Asian", label: "East Asian" },
    { value: "South Asian", label: "South Asian" },
    { value: "Southeast Asian", label: "Southeast Asian" },
    { value: "Middle Eastern", label: "Middle Eastern" },
    { value: "North African", label: "North African" },
    { value: "Native American or Alaska Native", label: "Native American or Alaska Native" },
    { value: "Native Hawaiian or Other Pacific Islander", label: "Native Hawaiian or Other Pacific Islander" },
    { value: "Jewish", label: "Jewish" }
  ];

  useEffect(() => {
    if (scrollRef) scrollRef.scrollTop = 0;
  }, [scrollRef]);

  return (
    <div className="form-card" ref={ref => setScrollRef(ref)} style={{ overflowY: 'auto', maxHeight: '90vh' }}>
      <h2>Step 6: Fine-Tuning Compatibility</h2>
      <p className="compatibility-subtitle">These optional questions help improve your match quality. You can skip and fill this out later.</p>

      {/* RELIGION */}
      <div className="form-group">
        <label>Select your religion(s):</label>
        <Select isMulti options={religionOptions} onChange={selected => handleChange('religions', selected.map(opt => opt.value))} value={religionOptions.filter(opt => formData.religions?.includes(opt.value))} className="dropdown-multiselect" />
        {formData.religions?.includes("Other (please specify)") && (
          <input type="text" placeholder="Please specify your religion" value={formData.otherReligion || ''} onChange={e => handleChange('otherReligion', e.target.value)} className="text-input" />
        )}
        {formData.religions?.length > 0 && (
          <>
            <label>Is different religion a dealbreaker?</label>
            <input type="range" min="0" max="3" value={formData.religionPref || 0} onChange={e => handleChange('religionPref', e.target.value)} />
            <p className="slider-label">{['No Preference','Weak','Strong','Dealbreaker'][formData.religionPref]}</p>
          </>
        )}
      </div>

      {/* RACE + RACE PREFERENCE */}
      <div className="form-group">
        <label>How do you identify your race/ethnicity?</label>
        <Select isMulti options={raceOptions} onChange={selected => handleChange('races', selected.map(opt => opt.value))} value={raceOptions.filter(opt => formData.races?.includes(opt.value))} className="dropdown-multiselect" />
      </div>

      <div className="form-group">
        <label>Do you have racial preferences?</label>
        <select className="dropdown" value={formData.hasRacePref || ''} onChange={e => handleChange('hasRacePref', e.target.value)}>
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      {formData.hasRacePref === 'yes' && (
        <div className="form-group">
          <label>Preferred race(s):</label>
          <Select isMulti options={raceOptions} onChange={selected => handleChange('racePreferences', selected.map(opt => opt.value))} value={raceOptions.filter(opt => formData.racePreferences?.includes(opt.value))} className="dropdown-multiselect" />
          <label>How important is this?</label>
          <input type="range" min="0" max="3" value={formData.racePrefStrength || 0} onChange={e => handleChange('racePrefStrength', e.target.value)} />
          <p className="slider-label">{['No Preference','Weak','Strong','Dealbreaker'][formData.racePrefStrength]}</p>
        </div>
      )}

      {/* Height self-selection (user's own height) */}
      <div className="form-group">
        <label>What is your height?</label>
        <ReactSlider
          className="range-slider"
          thumbClassName="range-thumb"
          trackClassName="range-track"
          min={48}
          max={84}
          step={1}
          value={formData.selfHeight || 66}
          onChange={(val) => handleChange('selfHeight', val)}
        />
        <p className="slider-label">
          {Math.floor((formData.selfHeight || 66) / 12)}'
          {(formData.selfHeight || 66) % 12}"
        </p>
      </div>

      {/* Height preference section */}
      <div className="form-group">
        <label>Do you have height preferences?</label>
        <select
          className="dropdown"
          value={formData.hasHeightPref || ''}
          onChange={(e) => handleChange('hasHeightPref', e.target.value)}
        >
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        {formData.hasHeightPref === 'yes' && (
          <>
            <label>Preferred height range:</label>
            <ReactSlider
              className="range-slider"
              thumbClassName="range-thumb"
              trackClassName="range-track"
              min={48}
              max={84}
              step={1}
              value={[
                formData.heightMin || 60,
                formData.heightMax || 72
              ]}
              onChange={([min, max]) => {
                handleChange('heightMin', min);
                handleChange('heightMax', max);
              }}
            />
            <p className="slider-label">
              {Math.floor((formData.heightMin || 60) / 12)}'
              {(formData.heightMin || 60) % 12}" — {Math.floor((formData.heightMax || 72) / 12)}'
              {(formData.heightMax || 72) % 12}"
            </p>

            <label>How important is this?</label>
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={formData.heightDealbreaker || 0}
              onChange={(e) => handleChange('heightDealbreaker', e.target.value)}
            />
            <p className="slider-label">
              {['No Preference','Weak','Strong','Dealbreaker'][formData.heightDealbreaker]}
            </p>
          </>
        )}
      </div>


      {/* AGE RANGE (REQUIRED, DUAL SLIDER) */}
      <div className="form-group">
        <label>Preferred age range:</label>
        <ReactSlider className="range-slider" thumbClassName="range-thumb" trackClassName="range-track" min={18} max={100} step={1} value={[formData.ageMin || 18, formData.ageMax || 35]} onChange={([min, max]) => { handleChange('ageMin', min); handleChange('ageMax', max); }} />
        <p className="slider-label">{formData.ageMin} – {formData.ageMax}</p>
      </div>

      {/* DISTANCE RANGE (DUAL SLIDER) */}
      <div className="form-group">
        <label>Preferred distance range (miles):</label>
        <ReactSlider className="range-slider" thumbClassName="range-thumb" trackClassName="range-track" min={0} max={100} step={1} value={[formData.distMin || 0, formData.distMax || 50]} onChange={([min, max]) => { handleChange('distMin', min); handleChange('distMax', max); }} />
        <p className="slider-label">{formData.distMin} – {formData.distMax} miles</p>
      </div>

      {/* Gender attraction */}
      <div className="form-group">
        <label>What genders are you attracted to?
          <div className="info-icon-wrapper">ⓘ<div className="info-tooltip">Nonbinary is automatically included as per updated definitions of sexuality.</div></div>
        </label>
        <select className="dropdown" value={formData.genderPref || ''} onChange={e => handleChange('genderPref', e.target.value)}>
          <option value="">Select</option>
          <option value="women">Women</option>
          <option value="men">Men</option>
          <option value="all">All</option>
        </select>

        {formData.genderPref === "all" && (
          <>
            <label>Slide toward your gender preference:</label>
            <input type="range" min="-3" max="3" step="1" value={formData.genderScale || 0} onChange={e => handleChange('genderScale', e.target.value)} />
            <p className="slider-label">{["Strong Women", "Prefer Women", "Slight Women", "No Pref", "Slight Men", "Prefer Men", "Strong Men"][parseInt(formData.genderScale) + 3]}</p>
          </>
        )}
      </div>

      {/* TRANS */}
      <div className="form-group">
        <label>Do you identify as transgender?</label>
        <select className="dropdown" value={formData.isTrans || ''} onChange={e => handleChange('isTrans', e.target.value)}>
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {formData.isTrans && (
          <>
            <label>Preference for a transgender partner?</label>
            <input type="range" min="0" max="4" value={formData.transPref || 2} onChange={e => handleChange('transPref', e.target.value)} />
            <p className="slider-label">{['Dealbreaker','Prefer Not','No Preference','Prefer','Necessary'][formData.transPref]}</p>
          </>
        )}
      </div>

      {/* ASEXUAL */}
      <div className="form-group">
        <label>Are you asexual?
          <div className="info-icon-wrapper">ⓘ<div className="info-tooltip">Asexuality is a sexual orientation where a person may not experience sexual attraction.</div></div>
        </label>
        <select className="dropdown" value={formData.isAsexual || ''} onChange={e => handleChange('isAsexual', e.target.value)}>
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {formData.isAsexual && (
          <>
            <label>Preference for asexual partner?</label>
            <input type="range" min="0" max="4" value={formData.asexualPref || 2} onChange={e => handleChange('asexualPref', e.target.value)} />
            <p className="slider-label">{['Dealbreaker','Prefer Not','No Preference','Prefer','Necessary'][formData.asexualPref]}</p>
          </>
        )}
      </div>

      {/* Substances */}
      <div className="form-group">
        <label>What is your frequency of substance use?</label>
        <select className="dropdown" value={formData.substances || ''} onChange={e => handleChange('substances', e.target.value)}>
          <option value="">Select</option>
          <option value="none">Don't use</option>
          <option value="socially">Socially / Occasionally</option>
          <option value="frequent">Frequently</option>
        </select>

        <label>Should your partner match your choice?</label>
        <input type="range" min="0" max="3" value={formData.substancePref || 0} onChange={e => handleChange('substancePref', e.target.value)} />
        <p className="slider-label">{['No Preference','Weak','Strong','Dealbreaker'][formData.substancePref]}</p>
      </div>

      {/* Children */}
      <div className="form-group">
        <label>Do you want children?</label>
        <select className="dropdown" value={formData.children || ''} onChange={e => handleChange('children', e.target.value)}>
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="later">Later</option>
          <option value="no">No</option>
          <option value="undecided">Undecided</option>
        </select>

        <label>Should your partner match your choice?</label>
        <input type="range" min="0" max="3" value={formData.childrenPref || 0} onChange={e => handleChange('childrenPref', e.target.value)} />
        <p className="slider-label">{['No Preference','Weak','Strong','Dealbreaker'][formData.childrenPref]}</p>
      </div>

      {/* Politics */}
      <div className="form-group">
        <label>Political alignment preference:</label>
        <select className="dropdown" value={formData.politics || ''} onChange={e => handleChange('politics', e.target.value)}>
          <option value="">Select</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="apolitical">Apolitical</option>
        </select>

        <label>Should your partner match your choice?</label>
        <input type="range" min="0" max="3" value={formData.politicsPref || 0} onChange={e => handleChange('politicsPref', e.target.value)} />
        <p className="slider-label">{['No Preference','Weak','Strong','Dealbreaker'][formData.politicsPref]}</p>
      </div>

      <div className="navigation-buttons">
        <button className="nav-button" onClick={onBack}>Back</button>
        <button className="nav-button" onClick={onNext}>Next</button>
        {/* <button className="nav-button" onClick={() => handleChange('skippedStep6', true)}>Skip and Fill Out Later</button> */}
      </div>
    </div>
  );
}

