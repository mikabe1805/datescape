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
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");




  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
  setLoading(true); // optional loading UI state
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
    const user = userCredential.user;

    console.log("✅ User created:", user.uid);

    const mediaFiles = formData.media || [];
    const mediaURLs = await uploadMediaFiles(user.uid, mediaFiles);
    console.log("✅ Media uploaded:", mediaURLs);

    const formDataForFirestore = { ...formData, media: mediaURLs };

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      ...formDataForFirestore,
      createdAt: new Date()
    });
    console.log("✅ User document written to Firestore.");

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const userData = userSnap.data();

    setLoadingMessage("Creating your match list...");
    await generateMatchesForUser({ ...userData, uid: user.uid }, user.uid);

    // Let Firestore settle
    setTimeout(() => {
      setLoadingMessage(""); // clear message
      sessionStorage.setItem("justSignedUp", "true");
      navigate('/app');
    }, 500);


  } catch (error) {
    console.warn("⚠️ Initial signup failed:", error);

    // Attempt recovery if user already exists in auth but not Firestore
    if (error.code === "auth/email-already-in-use") {
      try {
        console.log("ℹ️ Email already in use. Attempting recovery.");
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;

        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) {
          console.log("ℹ️ No Firestore user doc found. Creating it now...");

          const mediaURLs = await uploadMediaFiles(user.uid, formData.media || []);
          const formDataForFirestore = { ...formData, media: mediaURLs };

          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            ...formDataForFirestore,
            createdAt: new Date()
          });

          const userData = (await getDoc(doc(db, "users", user.uid))).data();
          await generateMatchesForUser({ ...userData, uid: user.uid }, user.uid);
          console.log("✅ Recovered user account successfully.");

          navigate('/app');
        } else {
          alert("An account with this email already exists. Please log in.");
        }
      } catch (err) {
        console.error("❌ Recovery attempt failed:", err);
        alert("Signup failed: could not complete account recovery.");
      }
    } else {
      alert(`Signup failed: ${error.message}`);
    }
  } finally {
    setLoading(false); // stop spinner if you're using one
  }
};





  const showStep6 = formData.lookingFor === "Dating" || formData.lookingFor === "Both";

  return (
    <div className="signup-background">
      <div className="signup-vine-overlay" />
      {loadingMessage && (
        <div className="loading-overlay">
          <div className="loading-message">{loadingMessage}</div>
        </div>
      )}


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
      <SignupStep5 
        formData={formData} 
        setFormData={setFormData} 
        loading={loading}
        onNext={async () => {
          if (!formData.media || !formData.media[0]) {
            alert("Please upload at least one photo.");
            return;
          }

          if (showStep6) {
            nextStep();
          } else {
            setLoading(true);
            try {
              await handleSubmit();
            } finally {
              setLoading(false);
            }
          }
        }} 
        onBack={prevStep} 
      />
    )}
      {step === 6 && showStep6 && (
        <SignupStep6 formData={formData} setFormData={setFormData} onNext={handleSubmit} onBack={prevStep} />
      )}
    </div>
  );
}

export default MultiStepSignup;
