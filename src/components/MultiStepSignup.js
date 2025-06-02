// MultiStepSignup.js
import React, { useState } from "react";
import SignupStep1 from "./SignupStep1";
import SignupStep2 from "./SignupStep2";
import SignupStep3 from "./SignupStep3";
import SignupStep4 from "./SignupStep4";
import "../styles.css"; // make sure styling is applied

function MultiStepSignup() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  return (
    <div className="signup-background">
      {/* Only render vine overlay ONCE here */}
      <div className="signup-vine-overlay" />

      {/* Step content appears above the vine */}
      {step === 1 && (
        <SignupStep1
          onNext={nextStep}
          formData={formData}
          setFormData={setFormData}
        />
      )}
      {step === 2 && (
        <SignupStep2
          onNext={nextStep}
          onBack={prevStep}
          formData={formData}
          setFormData={setFormData}
        />
      )}
      {step === 3 && (
    <SignupStep3
        formData={formData}
        setFormData={setFormData}
        nextStep={nextStep}
        prevStep={prevStep}
    />
    )}
    {step === 4 && (
    <SignupStep4
        formData={formData}
        setFormData={setFormData}
        nextStep={nextStep}
        prevStep={prevStep}
    />
    )}

    </div>
  );
}

export default MultiStepSignup;