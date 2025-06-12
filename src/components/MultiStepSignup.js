// MultiStepSignup.js
import React, { useState } from "react";
import { db } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import SignupStep1 from "./SignupStep1";
import SignupStep2 from "./SignupStep2";
import SignupStep3 from "./SignupStep3";
import SignupStep4 from "./SignupStep4";
import SignupStep5 from "./SignupStep5";
import SignupStep6 from "./SignupStep6";
import "../styles.css"; // make sure styling is applied
import { uploadMediaFiles } from '../utils/UploadMedia';
function MultiStepSignup() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    // other fields...
    media: [], // ← Ensure this is always an array
  });
  

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
    try {
      const mediaFiles = formData.media || [];

      const mediaURLs = await uploadMediaFiles(formData.uid, mediaFiles);

      const formDataForFirestore = { ...formData, media: mediaURLs };

      await setDoc(doc(db, "users", formData.uid), {
        uid: formData.uid,
        email: formData.email,
        profile: formDataForFirestore,
        createdAt: new Date()
      });

      alert("Signup complete!");
      navigate('/app');
    
    } catch (error) {
      console.error("Error saving user profile:", error);
      alert("Something went wrong while saving.");
    }
  }


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
    {step === 5 && (
    <SignupStep5
        formData={formData}
        setFormData={setFormData}
        onNext={nextStep}
        onBack={prevStep}
    />
    )}
    {step === 6 && (
    <SignupStep6
        formData={formData}
        setFormData={setFormData}
        onNext={handleSubmit}
        onBack={prevStep}
    />
    )}

    </div>
  );
}

export default MultiStepSignup;