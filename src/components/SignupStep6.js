// Full version of Step 6 wrapped in a consistent card layout with improved formatting
import React, { useState, useEffect } from 'react';
import '../styles.css';

export default function Step6Compatibility({ formData, setFormData, onNext, onBack }) {
  const [scrollRef, setScrollRef] = useState(null);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleMulti = (key, value) => {
    const current = formData[key] || [];
    if (current.includes(value)) {
      handleChange(key, current.filter(item => item !== value));
    } else {
      handleChange(key, [...current, value]);
    }
  };

  const religionOptions = ["Agnostic", "Atheist", "Buddhist", "Christian – Catholic", "Christian – Protestant", "Christian – Other", "Hindu", "Jewish", "Muslim", "Sikh", "Spiritual but not religious", "Pagan / Earth-based", "Taoist", "Unitarian Universalist", "No religion", "Other (please specify)"];

  useEffect(() => {
    if (scrollRef) scrollRef.scrollTop = 0;
  }, [scrollRef]);

  return (
    <div className="form-card" ref={ref => setScrollRef(ref)} style={{ overflowY: 'auto', maxHeight: '90vh' }}>
      <h2>Step 6: Fine-Tuning Compatibility</h2>
      <p className="compatibility-subtitle">These optional questions help improve your match quality. You can skip and fill this out later.</p>

      {/* Transgender Identity */}
      <div className="form-group">
        <label>Do you identify as transgender? <span className="info-icon" title="This is used for preference matching. If you strongly present as your assigned gender at birth, you may choose 'No' to increase matches.">ⓘ</span></label>
        <select onChange={e => handleChange('isTrans', e.target.value)} value={formData.isTrans || ''} className="dropdown">
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        {formData.isTrans && (
          <div className="slider-group">
            <label>Preference for a transgender partner?</label>
            <input type="range" min="0" max="4" step="1" value={formData.transPref || 2} onChange={e => handleChange('transPref', e.target.value)} />
            <p className="slider-label">{['Dealbreaker','Prefer Not','No Preference','Prefer','Necessary'][formData.transPref]}</p>
          </div>
        )}
      </div>

      {/* Asexual Orientation */}
      <div className="form-group">
        <label>Are you asexual? <span className="info-icon" title="Asexuality is a sexual orientation where a person may not experience sexual attraction.">ⓘ</span></label>
        <select onChange={e => handleChange('isAsexual', e.target.value)} value={formData.isAsexual || ''} className="dropdown">
          <option value="">Select</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        {formData.isAsexual && (
          <div className="slider-group">
            <label>Preference for asexual partner?</label>
            <input type="range" min="0" max="4" step="1" value={formData.asexualPref || 2} onChange={e => handleChange('asexualPref', e.target.value)} />
            <p className="slider-label">{['Dealbreaker','Prefer Not','No Preference','Prefer','Necessary'][formData.asexualPref]}</p>
          </div>
        )}
      </div>

      {/* Religion Section */}
      <div className="form-group">
        <label>Select your religion(s):</label>
        <div className="multi-select">
          {religionOptions.map(rel => (
            <label key={rel} className="multi-option">
              <input type="checkbox" checked={formData.religions?.includes(rel)} onChange={() => toggleMulti('religions', rel)} />
              {rel}
            </label>
          ))}
        </div>
        {formData.religions?.includes("Other (please specify)") && (
          <input type="text" placeholder="Please specify your religion" value={formData.otherReligion || ''} onChange={e => handleChange('otherReligion', e.target.value)} className="text-input" />
        )}

        <div className="slider-group">
          <label>Is someone being a different religion than you a dealbreaker?</label>
          <input type="range" min="0" max="3" step="1" value={formData.religionPref || 0} onChange={e => handleChange('religionPref', e.target.value)} />
          <p className="slider-label">{['No Preference','Weak Preference','Strong Preference','Dealbreaker'][formData.religionPref]}</p>
        </div>
      </div>

      <div className="navigation-buttons">
        <button className="nav-button" onClick={onBack}>Back</button>
        <button className="nav-button" onClick={onNext}>Next</button>
        <button className="nav-button" onClick={() => handleChange('skippedStep6', true)}>Skip and Fill Out Later</button>
      </div>
    </div>
  );
}
