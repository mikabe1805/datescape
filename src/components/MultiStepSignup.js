import React, { useCallback, useState } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../firebase";
import SignupStep1 from "./SignupStep1";
import SignupStep2 from "./SignupStep2";
import SignupStepLocation from "./SignupStepLocation";
import SignupStep3 from "./SignupStep3";
import SignupStep4 from "./SignupStep4";
import SignupStep5 from "./SignupStep5";
import SignupStep6 from "./SignupStep6";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import { uploadMediaFiles } from "../utils/UploadMedia";
import { isImageMedia } from "../utils/MediaUtils";
import { stripSensitiveProfileFields } from "../utils/DataUtils";
import "../styles/forest.css";
import "../styles.css";

function MultiStepSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    media: [],
    selfHeight: 66,
    birthdate: null,
    gender: null,
    lookingFor: "",
    isAsexual: "",
    isTrans: "",
    heightMin: 48,
    heightMax: 84,
    ageMin: 18,
    ageMax: 100, // 100 = "no upper limit" sentinel — see src/utils/geo.js
    distMin: 0,
    distMax: 100, // 100 = "no limit" sentinel
    location: null, // { lat, lng, city, source } set in Step 3
    transPref: "2",
    asexualPref: "2",
    politics: "",
    politicsPref: "0",
    racePref: [],
    religionPref: "0",
    childrenPref: "0",
    substancePref: "0",
    racePrefStrength: "0",
    heightDealbreaker: "0",
    genderScale: "0",
    email: "",
    password: "",
    username: "",
    interests: [],
    races: [],
    religions: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [signupError, setSignupError] = useState(null);
  const [uploadIssues, setUploadIssues] = useState([]); // {index, name, reason}

  const nextStep = useCallback(() => setStep((p) => p + 1), []);
  const prevStep = useCallback(() => setStep((p) => p - 1), []);

  // Step layout (with the new Location step at position 3):
  //   1 = Account, 2 = Basics, 3 = Location, 4 = Interests,
  //   5 = Prompts, 6 = Media, 7 = Compatibility (only for Dating/Both)
  const showCompatibility = formData.lookingFor === "Dating" || formData.lookingFor === "Both";
  const lastStep = 6;

  const performSignup = useCallback(
    async ({ skipFailedMedia = false } = {}) => {
      setSignupError(null);
      setUploadIssues([]);
      setLoading(true);
      setLoadingMessage("Creating your account…");

      try {
        // 1. Create or recover the auth user.
        let user;
        try {
          const cred = await createUserWithEmailAndPassword(
            auth,
            formData.email,
            formData.password
          );
          user = cred.user;
        } catch (err) {
          if (err.code === "auth/email-already-in-use") {
            setLoadingMessage("Recovering existing account…");
            try {
              const cred = await signInWithEmailAndPassword(
                auth,
                formData.email,
                formData.password
              );
              user = cred.user;
            } catch (innerErr) {
              if (innerErr.code === "auth/wrong-password") {
                throw new Error(
                  "An account with this email exists, but the password you entered is wrong. Try logging in instead."
                );
              }
              throw innerErr;
            }
            const existing = await getDoc(doc(db, "users", user.uid));
            if (existing.exists() && existing.data()?.displayName) {
              throw new Error(
                "An account with this email already exists. Please log in instead."
              );
            }
          } else {
            throw err;
          }
        }

        // 2. Upload media (single attempt, not double). Tolerate per-file failures.
        const filesToUpload = (formData.media || []).filter(Boolean);
        let mediaURLs = [];
        if (filesToUpload.length > 0) {
          setLoadingMessage(
            `Uploading photos (0/${filesToUpload.length})…`
          );
          const result = await uploadMediaFiles(user.uid, filesToUpload, {
            onProgress: ({ index, total, phase }) => {
              if (phase === "done") {
                setLoadingMessage(
                  `Uploading photos (${index + 1}/${total})…`
                );
              }
            },
          });
          mediaURLs = result.urls;
          const coverUploadFailed = result.errors.some(
            (issue) => issue.index === 0,
          );
          if (coverUploadFailed) {
            setSignupError(
              "Your cover photo did not upload. Retry it before continuing.",
            );
            setUploadIssues(result.errors);
            setLoading(false);
            setLoadingMessage("");
            return;
          }
          if (result.errors.length > 0 && !skipFailedMedia) {
            setUploadIssues(result.errors);
            setLoading(false);
            setLoadingMessage("");
            return; // halt; user will choose retry / skip
          }
          if (mediaURLs.length === 0 && !skipFailedMedia) {
            setSignupError(
              "All uploads failed. Check your connection or pick smaller files, then try again."
            );
            setUploadIssues(result.errors);
            setLoading(false);
            setLoadingMessage("");
            return;
          }
        }

        // 3. Save profile.
        setLoadingMessage("Saving your profile…");
        const profileFields = stripSensitiveProfileFields(formData);
        delete profileFields.media;
        const payload = {
          uid: user.uid,
          ...profileFields,
          media: mediaURLs,
          displayName: formData.displayName || formData.username || "",
          createdAt: new Date(),
        };
        await setDoc(doc(db, "users", user.uid), payload, { merge: true });

        // 4. Generate matches.
        setLoadingMessage("Setting up your match list…");
        try {
          const fresh = (await getDoc(doc(db, "users", user.uid))).data();
          await generateMatchesForUser({ ...fresh, uid: user.uid }, user.uid);
        } catch (err) {
          // Non-fatal; the user can still use the app.
          console.warn("Match generation failed:", err.message);
        }

        // 5. Done.
        setLoadingMessage("Welcome to DateScape.");
        await new Promise((r) => setTimeout(r, 350));
        // Arrival Conservatory is the first authenticated orientation. Keep
        // signup completion focused on that world entry instead of arming a
        // second app-shell tour on a delay.
        navigate("/app/explore");
      } catch (err) {
        console.error("Signup failed:", err);
        setSignupError(err.message || "Something went wrong during signup.");
        setLoading(false);
        setLoadingMessage("");
      }
    },
    [formData, navigate]
  );

  const handleSubmit = useCallback(() => performSignup(), [performSignup]);
  const handleRetryUploads = useCallback(() => performSignup(), [performSignup]);
  const handleSkipFailedUploads = useCallback(
    () => performSignup({ skipFailedMedia: true }),
    [performSignup]
  );

  const stepLabel = step > lastStep ? "Optional preferences" : `Step ${step} of ${lastStep}`;
  const progressPct = Math.round((Math.min(step, lastStep) / lastStep) * 100);

  const stepProps = {
    formData,
    setFormData,
    loading,
  };

  return (
    <div className="forest-shell">
      <div className="forest-shell__bg" aria-hidden="true" />
      <div className="forest-shell__veil" aria-hidden="true" />

      <div className="forest-shell__progress">
        <div className="forest-shell__progress-label">
          <span>{stepLabel}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="forest-shell__progress-bar">
          <div
            className="forest-shell__progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="forest-shell__main">
        {step === 1 && <SignupStep1 {...stepProps} onNext={nextStep} />}
        {step === 2 && <SignupStep2 {...stepProps} onNext={nextStep} onBack={prevStep} />}
        {step === 3 && <SignupStepLocation {...stepProps} onNext={nextStep} onBack={prevStep} />}
        {step === 4 && <SignupStep3 {...stepProps} nextStep={nextStep} prevStep={prevStep} />}
        {step === 5 && <SignupStep4 {...stepProps} nextStep={nextStep} prevStep={prevStep} />}
        {step === 6 && (
          <SignupStep5
            {...stepProps}
            onBack={prevStep}
            onNext={async () => {
              if (!formData.media || !isImageMedia(formData.media[0])) {
                setSignupError("Please upload at least one photo.");
                return;
              }
              setSignupError(null);
              if (showCompatibility) {
                nextStep();
              } else {
                await handleSubmit();
              }
            }}
          />
        )}
        {step === 7 && showCompatibility && (
          <SignupStep6
            {...stepProps}
            onBack={prevStep}
            onNext={handleSubmit}
          />
        )}
      </div>

      {(signupError || uploadIssues.length > 0) && !loadingMessage && (
        <div className="forest-toast" role="alert">
          {signupError && <div className="forest-toast__title">{signupError}</div>}
          {uploadIssues.length > 0 && (
            <>
              <div className="forest-toast__list">
                {uploadIssues.map((issue) => (
                  <div key={issue.index} className="forest-toast__row">
                    <strong>{issue.name || `Photo ${issue.index + 1}`}:</strong> {issue.reason}
                  </div>
                ))}
              </div>
              <div className="forest-toast__actions">
                <button
                  type="button"
                  className="ds-btn ds-btn--ghost"
                  onClick={handleSkipFailedUploads}
                >
                  Skip these and continue
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--primary"
                  onClick={handleRetryUploads}
                >
                  Retry
                </button>
              </div>
            </>
          )}
          {signupError && uploadIssues.length === 0 && (
            <div className="forest-toast__actions">
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                onClick={() => setSignupError(null)}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {loadingMessage && (
        <div className="forest-loading-overlay" role="status" aria-live="polite">
          <div className="forest-loading-card">
            <div className="forest-spinner" aria-hidden="true" />
            <div className="forest-loading-text">{loadingMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiStepSignup;
