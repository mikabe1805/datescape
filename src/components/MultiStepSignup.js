// MultiStepSignup.js
import React, { useState } from "react";
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import SignupStep1 from "./SignupStep1";
import SignupStep2 from "./SignupStep2";
import SignupStep3 from "./SignupStep3";
import SignupStep4 from "./SignupStep4";
import SignupStep5 from "./SignupStep5";
import SignupStep6 from "./SignupStep6";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import "../styles.css";
import { uploadMediaFiles } from '../utils/UploadMedia';

function MultiStepSignup() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
  media: [],

  // Self Info
  selfHeight: 66,         // 5'6" default
  birthdate: null,
  gender: null,
  lookingFor: "",
  isAsexual: "",
  isTrans: "",

  // Preferences
  heightMin: 48,          // 4'0"
  heightMax: 84,          // 7'0"
  ageMin: 18,
  ageMax: 100,
  distMin: 0,
  distMax: 100,

  transPref: "2",
  asexualPref: "2",
  politicsPref: "0",
  racePref: [],
  religionPref: "0",
  childrenPref: "0",
  substancePref: "0",

  // Dealbreakers
  racePrefStrength: "0",
  heightDealbreaker: "0",
  genderScale: "0",

  // Account Info
  email: "",
  password: "",
  username: "",

  // Interests
  interests: [],
  races: [],
  religions: [],
});


  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
    const user = userCredential.user;

    console.log("User created:", user.uid);

    const mediaFiles = formData.media || [];
    const mediaURLs = await uploadMediaFiles(user.uid, mediaFiles);
    console.log("Media uploaded:", mediaURLs);

    const formDataForFirestore = { ...formData, media: mediaURLs };
    console.log("Writing to Firestore:", formDataForFirestore);

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      ...formDataForFirestore,
      createdAt: new Date()
    });

    console.log("User document written to Firestore.");

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();

    await generateMatchesForUser({ ...userData, uid: user.uid }, user.uid);

    navigate('/app');
  } catch (error) {
  if (error.code === "auth/email-already-in-use") {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) {
        // Resume the Firestore creation step
        const mediaURLs = await uploadMediaFiles(user.uid, formData.media || []);
        const formDataForFirestore = { ...formData, media: mediaURLs };

        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          ...formDataForFirestore,
          createdAt: new Date()
        });

        const userData = (await getDoc(doc(db, "users", user.uid))).data();
        await generateMatchesForUser({ ...userData, uid: user.uid }, user.uid);

        navigate('/app');
      } else {
        alert("An account already exists. Please log in.");
      }
    } catch (err) {
      console.error("Failed to recover from existing auth user:", err);
      alert("Something went wrong when recovering account.");
    }
  } else {
    console.error("Signup failed:", error);
    alert(`Signup failed: ${error.message}`);
  }
}
};




  const showStep6 = formData.lookingFor === "Dating" || formData.lookingFor === "Both";

  return (
    <div className="signup-background">
      <div className="signup-vine-overlay" />

      {step === 1 && (
        <SignupStep1 onNext={nextStep} formData={formData} setFormData={setFormData} />
      )}
      {step === 2 && (
        <SignupStep2 onNext={nextStep} onBack={prevStep} formData={formData} setFormData={setFormData} />
      )}
      {step === 3 && (
        <SignupStep3 formData={formData} setFormData={setFormData} nextStep={nextStep} prevStep={prevStep} />
      )}
      {step === 4 && (
        <SignupStep4 formData={formData} setFormData={setFormData} nextStep={nextStep} prevStep={prevStep} />
      )}
      {step === 5 && (
        <SignupStep5 formData={formData} setFormData={setFormData} onNext={() => {
          if (showStep6) {
            nextStep();
          } else {
            handleSubmit();
          }
        }} onBack={prevStep} />
      )}
      {step === 6 && showStep6 && (
        <SignupStep6 formData={formData} setFormData={setFormData} onNext={handleSubmit} onBack={prevStep} />
      )}
    </div>
  );
}

export default MultiStepSignup;
