import React, { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { doc, getDoc, updateDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useMatchStore } from "./MatchStore";
import NotificationSettings from "../pages/NotificationSettings";
import Select from "react-select";
import Navbar from "../components/Navbar";
import ReactSlider from "react-slider";
import "../ProfilePage.css";
import "../Slider.css";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { uploadMediaFiles } from '../utils/UploadMedia';

function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [originalProfile, setOriginalProfile] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    email: false,
    emailAddress: "",
    sms: false,
    phoneNumber: "",
    useLoginEmail: false,
  });



  const user = auth.currentUser;

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setNotificationSettings({
          email: data.notifications?.emailEnabled || false,
          emailAddress: data.notifications?.email || "",
          sms: data.notifications?.smsEnabled || false,
          phoneNumber: data.notifications?.phone || "",
          useLoginEmail: data.notifications?.email === user?.email,
        });
        const flattened = data.profile ? { uid: data.uid, ...data.profile } : data;
        flattened.races = flattened.races || [];
        flattened.religions = flattened.religions || [];
        flattened.racePref = flattened.racePref || [];
        
        setProfile(flattened);
        setOriginalProfile(JSON.parse(JSON.stringify(flattened))); // deep clone
      }
      setLoading(false);
    }
    fetchProfile();
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleMultiSelectChange = (name, selectedOptions) => {
    const selectedValues = selectedOptions.map(option => option.value);
    setProfile((prev) => ({ ...prev, [name]: selectedValues }));
  };

  const handleSliderChange = (name, value) => {
    setProfile((prev) => ({ ...prev, [name]: value.toString() }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const totalAllowed = 6 - ((profile.media?.length || 0) + mediaFiles.length);
    
    if (selectedFiles.length > totalAllowed) {
      alert(`You can only upload ${totalAllowed} more media file(s).`);
      return;
    }

    // File validation
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for videos
    const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

    const validFiles = [];
    const invalidFiles = [];

    selectedFiles.forEach(file => {
      const isValidImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
      const isValidVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
      
      if (!isValidImage && !isValidVideo) {
        invalidFiles.push(`${file.name}: Unsupported file type`);
        return;
      }

      const maxSize = isValidVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
      if (file.size > maxSize) {
        const maxSizeMB = maxSize / (1024 * 1024);
        invalidFiles.push(`${file.name}: File too large (max ${maxSizeMB}MB)`);
        return;
      }

      validFiles.push(file);
    });

    if (invalidFiles.length > 0) {
      alert(`Some files were rejected:\n${invalidFiles.join('\n')}`);
    }

    if (validFiles.length > 0) {
      setMediaFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDeleteMedia = async (url) => {
    if (profile.media.length <= 1) {
      alert("You must have at least one image uploaded.");
      return;
    }
    if (!window.confirm("Delete this media?")) return;
    try {
      const fileRef = ref(storage, decodeURIComponent(new URL(url).pathname.split("/o/")[1].split("?")[0]));
      await deleteObject(fileRef);
      const updatedMedia = profile.media.filter((item) => item !== url);
      setProfile((prev) => ({ ...prev, media: updatedMedia }));
      await updateDoc(doc(db, "users", user.uid), { media: updatedMedia });
    } catch (err) {
      console.error("Failed to delete media:", err);
    }
  };

  const deleteOldMatches = async () => {
  const userId = user.uid;

  const qA = query(
    collection(db, "matches"),
    where("userA", "==", userId),
    where("isActiveA", "==", true)
  );

  const qB = query(
    collection(db, "matches"),
    where("userB", "==", userId),
    where("isActiveB", "==", true)
  );

  const [snapA, snapB] = await Promise.all([
    getDocs(qA),
    getDocs(qB)
  ]);

  const allDocs = [...snapA.docs, ...snapB.docs];

  await Promise.all(allDocs.map(doc => deleteDoc(doc.ref)));
};

const uploadNewMedia = async (uid, files) => {
  try {
    return await uploadMediaFiles(uid, files);
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

  const handleSave = async () => {
    setSaving(true);
    try {
      const userId = user.uid;
      const userRef = doc(db, "users", userId);

      // 1. Load existing profile data
      const snap = await getDoc(userRef);
      const oldProfile = snap.data()?.profile || {};

      // 2. Define profile keys to track
      const matchFields = [
        "displayName", "bio", "gender", "lookingFor",
        "genderPref", "genderScale", "interests", "religions", "religionPref", "religionDealbreaker",
        "races", "racePrefStrength", "raceDealbreaker",
        "children", "childrenPref", "childrenDealbreaker",
        "politics", "politicsPref", "politicalDealbreaker",
        "substances", "substancePref", "substanceDealbreaker",
        "isTrans", "transPref", "transDealbreaker",
        "isAsexual", "asexualPref", "asexualDealbreaker",
        "selfHeight", "heightMin", "heightMax", "heightDealbreaker",
        "hasHeightPref", "hasRacePref", "ageMin", "ageMax",
        "distMin", "distMax", "profilePrompts"
      ];

      // 3. Diff between current and new profile
      const diff = {};
      matchFields.forEach((key) => {
        const before = oldProfile[key];
        const after = profile[key];
        if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) {
          diff[`profile.${key}`] = after;
        }
      });

      // 4. Handle media uploads
      if (mediaFiles.length) {
        const existing = oldProfile.media || [];
        if (existing.length + mediaFiles.length > 6) {
          alert("You can only upload 6 media files total.");
          return;
        }
        const newUrls = await uploadNewMedia(userId, mediaFiles);
        diff["profile.media"] = [...existing, ...newUrls];
      }

      const needsMatchRegen = Object.keys(diff).length > 0;

      // 5. Run transaction: update fields + delete existing matches
      await runTransaction(db, async (tx) => {
        if (needsMatchRegen) {
          tx.update(userRef, diff);

          const qA = query(
            collection(db, "matches"),
            where("userA", "==", userId),
            where("isActiveA", "==", true)
          );
          const qB = query(
            collection(db, "matches"),
            where("userB", "==", userId),
            where("isActiveB", "==", true)
          );
          const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
          [...snapA.docs, ...snapB.docs].forEach((d) => tx.delete(d.ref));
        }
      });

      // 6. Regenerate matches
      if (needsMatchRegen) {
        const freshSnap = await getDoc(userRef);
        const full = freshSnap.data();
        await generateMatchesForUser({ ...full.profile, uid: userId }, userId);
      }

      // 7. Show success message, then redirect
      setMediaFiles([]);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        navigate("/app/match-queue");
      }, 1200);

    } catch (err) {
      console.error("Error saving profile:", err);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };


  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid));
      await user.delete();
      navigate("/");
    } catch (err) {
      console.error("Error deleting account:", err);
      alert("Failed to delete account.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      console.error("Error signing out:", err);
      alert("Failed to sign out.");
    }
  };

  if (loading) return <div className="loading-screen">Loading profile...</div>;
  if (!profile) return <div className="error-screen">No profile found.</div>;

  return (
    <div className="profile-page">
      <Navbar />
      <h2>Edit Profile</h2>
      <div className="profile-card">

        <div className="field-group">
          <label>Display Name:</label>
          <input name="displayName" value={profile.displayName || ""} onChange={handleInputChange} />
        </div>

        <div className="field-group">
          <label>Bio:</label>
          <textarea name="bio" value={profile.bio || ""} onChange={handleInputChange} />
        </div>

        <div className="field-group">
          <label>Looking For:</label>
          <select name="lookingFor" value={profile.lookingFor || "Both"} onChange={handleInputChange}>
            <option value="Friendship">Friendship</option>
            <option value="Dating">Dating</option>
            <option value="Both">Both</option>
          </select>
        </div>

        <div className="field-group">
          <label>Gender:</label>
          <select name="gender" value={profile.gender || ""} onChange={handleInputChange}>
            <option value="Man">Man</option>
            <option value="Woman">Woman</option>
            <option value="Nonbinary">Nonbinary</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="field-group">
          <label>Politics:</label>
          <select name="politics" value={profile.politics || ""} onChange={handleInputChange}>
          <option value="">— Select —</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="None">None</option>
          </select>
        </div>

        <div className="field-group">
          <label>Substances:</label>
          <select name="substances" value={profile.substances || ""} onChange={handleInputChange}>
          <option value="">— Select —</option>
            <option value="none">Don't use</option>
            <option value="socially">Socially / Occasionally</option>
            <option value="frequent">Frequently</option>
          </select>
        </div>

        <div className="field-group">
          <label>Children:</label>
          <select name="children" value={profile.children || ""} onChange={handleInputChange}>
          <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="later">Later</option>
            <option value="no">No</option>
            <option value="undecided">Undecided</option>
          </select>
        </div>

        <div className="field-group">
          <label>Are you transgender?:</label>
          <select name="isTrans" value={profile.isTrans || ""} onChange={handleInputChange}>
          <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="field-group">
          <label>Are you Asexual?:</label>
          <select name="isAsexual" value={profile.isAsexual || ""} onChange={handleInputChange}>
          <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="form-group">
        <label>What is your height?</label>
        <ReactSlider
          className="range-slider"
          thumbClassName="range-thumb"
          trackClassName="range-track"
          min={48}
          max={84}
          step={1}
          value={profile.selfHeight || 66}
          onChange={(val) => handleSliderChange("selfHeight", val)}
        />
        <p className="slider-label">
          {Math.floor((profile.selfHeight || 66) / 12)}'
          {(profile.selfHeight || 66) % 12}"
        </p>
      </div>

        <div className="field-group">
          <label>Religions:</label>
          <Select
            isMulti
            name="religions"
            options={religionOptions.map(opt => ({ value: opt, label: opt }))}
            value={(profile.religions || []).map(val => ({ value: val, label: val }))}
            onChange={(selected) => handleMultiSelectChange("religions", selected)}
          />
        </div>

        <div className="field-group">
          <label>Races:</label>
          <Select
            isMulti
            name="races"
            options={raceOptions.map(opt => ({ value: opt, label: opt }))}
            value={(profile.races || []).map(val => ({ value: val, label: val }))}
            onChange={(selected) => handleMultiSelectChange("races", selected)}
          />
        </div>

        <div className="field-group">
          <label>Media (max 6 total):</label>
          <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} />
        </div>

        <div className="media-preview">
          <strong>Uploaded Media:</strong>
          <div className="media-grid">
            {[...(profile.media || []), ...mediaFiles.map(file => URL.createObjectURL(file))].map((url, idx) => {
              // Check if it's a video file - handle both URL strings and File objects
              const isVideo = (() => {
                if (idx < (profile.media?.length || 0)) {
                  // This is an uploaded media URL from Firebase
                  const videoExtensions = ['.mp4', '.webm', '.mov', '.quicktime', '.avi', '.m4v'];
                  const isVideoUrl = videoExtensions.some(ext => url.toLowerCase().includes(ext));
                  
                  return isVideoUrl;
                } else {
                  // This is a pending upload File object
                  const file = mediaFiles[idx - (profile.media?.length || 0)];
                  const isVideoFile = file && file.type.startsWith('video');
                  
                  return isVideoFile;
                }
              })();
              
              return (
                <div key={idx} className="media-thumbnail">
                  {isVideo ? (
                    <video src={url} controls preload="metadata" width="150" height="150" />
                  ) : (
                    <img src={url} alt={`media-${idx}`} width="150" height="150" />
                  )}
                  {idx < (profile.media?.length || 0) ? (
                    <button onClick={() => handleDeleteMedia(url)} style={{ marginTop: "5px" }}>Delete</button>
                  ) : (
                    <span style={{ fontSize: "0.8rem", color: "#888" }}>Pending upload</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {mediaFiles.length > 0 && (
        <div className="media-preview">
          <strong>Pending Uploads:</strong>
          <div className="media-grid">
            {mediaFiles.map((file, idx) => (
              <div key={idx} className="media-thumbnail">
                {file.type.startsWith("video") ? (
                  <video src={URL.createObjectURL(file)} controls width="150" height="150" />
                ) : (
                  <img src={URL.createObjectURL(file)} alt={`new-media-${idx}`} width="150" height="150" />
                )}
                <button onClick={() =>
                  setMediaFiles(prev => prev.filter((_, i) => i !== idx))
                }>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}


        <h3>Fine-Tuning Compatibility</h3>

        <div className="form-group">
        <label>Preferred age range:</label>
        <ReactSlider className="range-slider" thumbClassName="range-thumb" trackClassName="range-track" min={18} max={100} step={1} value={[profile.ageMin || 18, profile.ageMax || 35]} onChange={([min, max]) => { handleSliderChange("ageMin", min); handleSliderChange("ageMax", max); }} />
        <p className="slider-label">{profile.ageMin} – {profile.ageMax}</p>
      </div>

      {/* DISTANCE RANGE (DUAL SLIDER) */}
      <div className="form-group">
        <label>Preferred distance range (miles):</label>
        <ReactSlider className="range-slider" thumbClassName="range-thumb" trackClassName="range-track" min={0} max={100} step={1} value={[profile.distMin || 0, profile.distMax || 50]} onChange={([min, max]) => { handleSliderChange("distMin", min); handleSliderChange("distMax", max); }} />
        <p className="slider-label">{profile.distMin} – {profile.distMax} miles</p>
      </div>

        <div className="field-group">
          <label>Racial preferences?</label>
          <Select
            isMulti
            name="racePreferences"
            options={raceOptions.map(opt => ({ value: opt, label: opt }))}
            value={(profile.racePreferences || []).map(val => ({ value: val, label: val }))}
            onChange={(selected) => handleMultiSelectChange("racePreferences", selected)}
          />
        </div>

        <label>Preferred height range:</label>
            <ReactSlider
              className="range-slider"
              thumbClassName="range-thumb"
              trackClassName="range-track"
              min={48}
              max={84}
              step={1}
              value={[
                profile.heightMin || 60,
                profile.heightMax || 72
              ]}
              onChange={([min, max]) => {
                handleSliderChange("heightMin", min);
                handleSliderChange("heightMax", max);
              }}
            />
            <p className="slider-label">
              {Math.floor((profile.heightMin || 60) / 12)}'
              {(profile.heightMin || 60) % 12}" — {Math.floor((profile.heightMax || 72) / 12)}'
              {(profile.heightMax || 72) % 12}"
            </p>

        <CompatibilitySection profile={profile} setProfile={setProfile} />

        {saveSuccess && (
          <div className="save-confirmation">
            ✔ Saved!
          </div>
        )}


        <div className="button-group">
          <button 
            className="glass-btn" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            className="glass-btn"
            onClick={() => {
              if (!originalProfile) {
                alert("Original profile not loaded yet.");
                return;
              }
              setProfile({ ...originalProfile });  // clone to prevent reference glitches
              setMediaFiles([]);
            }}
            disabled={saving}
          >
            Revert
          </button>
          <button className="glass-btn" onClick={() => setShowNotificationModal(true)} disabled={saving}>Notification Settings</button>
          <button className="glass-btn" onClick={handleLogout} disabled={saving}>Log Out</button>
          <button className="glass-btn" style={{ color: "red" }} onClick={handleDeleteAccount} disabled={saving}>Delete Account</button>
        </div>
        {showNotificationModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md">
      <h3 className="text-xl font-bold mb-4">Notification Settings</h3>

      {/* Email notifications */}
      <div className="mb-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={notificationSettings.email}
            onChange={(e) =>
              setNotificationSettings((prev) => ({
                ...prev,
                email: e.target.checked,
              }))
            }
            className="form-checkbox h-5 w-5 text-indigo-600"
          />
          <span className="ml-2">Enable Email Notifications</span>
        </label>

        {notificationSettings.email && (
          <>
            <input
              type="email"
              className="mt-2 w-full border border-gray-300 rounded-md p-2"
              placeholder="Enter email"
              value={notificationSettings.emailAddress}
              onChange={(e) =>
                setNotificationSettings((prev) => ({
                  ...prev,
                  emailAddress: e.target.value,
                }))
              }
              disabled={notificationSettings.useLoginEmail}
            />

            <label className="inline-flex items-center mt-2">
              <input
                type="checkbox"
                checked={notificationSettings.useLoginEmail}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    useLoginEmail: e.target.checked,
                    emailAddress: e.target.checked ? user?.email || "" : "",
                  }))
                }
                className="form-checkbox h-5 w-5 text-indigo-600"
              />
              <span className="ml-2">Same as login email</span>
            </label>
          </>
        )}
      </div>

      {/* SMS notifications */}
      <div className="mb-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={notificationSettings.sms}
            onChange={(e) =>
              setNotificationSettings((prev) => ({
                ...prev,
                sms: e.target.checked,
              }))
            }
            className="form-checkbox h-5 w-5 text-indigo-600"
          />
          <span className="ml-2">Enable SMS Notifications</span>
        </label>

        {notificationSettings.sms && (
          <PhoneInput
            international
            defaultCountry="US"
            value={notificationSettings.phoneNumber}
            onChange={(value) =>
              setNotificationSettings((prev) => ({
                ...prev,
                phoneNumber: value,
              }))
            }
            className="mt-2 w-full border border-gray-300 rounded-md p-2"
          />
        )}
      </div>

      {/* Buttons */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowNotificationModal(false)}
          className="glass-btn"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            try {
              const userRef = doc(db, "users", user.uid);
              if (notificationSettings.email && !notificationSettings.emailAddress) {
                alert("Please enter a valid email address.");
                return;
              }
              if (notificationSettings.sms && !notificationSettings.phoneNumber) {
                alert("Please enter a valid phone number.");
                return;
              }

              await updateDoc(userRef, {
              notifications: {
                emailEnabled: notificationSettings.email,
                email: notificationSettings.emailAddress,
                smsEnabled: notificationSettings.sms,
                phone: notificationSettings.phoneNumber,
              }
            });
              setShowNotificationModal(false);
            } catch (err) {
              console.error("Failed to save notification settings:", err);
              alert("Failed to save settings.");
            }
          }}
          className="glass-btn"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}


      </div>
    </div>
  );
}

function CompatibilitySection({ profile, setProfile }) {
  const preferenceLabels = ["No preference", "Weak", "Moderate", "Strong", "Dealbreaker"];
  const genderLabels = [
    "Strongly prefer men",
    "Prefer men",
    "Slightly prefer men",
    "No preference",
    "Slightly prefer women",
    "Prefer women",
    "Strongly prefer women"
  ];
  const preference2 = [
    "Dealbreaker",
    "Prefer not",
    "No preference",
    "Prefer",
    "Necessary"
  ];

  const preferences = [
    { key: "racePrefStrength", label: "Racial Preference Strength" },
    { key: "heightDealbreaker", label: "Height Preference Strength" },
    { key: "religionPref", label: "Religion Preference Strength" },
    { key: "politicsPref", label: "Politics Preference" },
    { key: "substancePref", label: "Substance Preference" },
    { key: "childrenPref", label: "Children Preference" },
  ];
  const preferences2 = [
    { key: "transPref", label: "Trans Preference" },
    { key: "asexualPref", label: "Asexual Preference" }
  ]

  const handleSliderChange = (name, value) => {
    setProfile((prev) => ({ ...prev, [name]: value.toString() }));
  };

  return (
    <>
      {preferences.map(({ key, label }) => (
        <div className="field-group" key={key}>
          <label>{label}</label>
          <ReactSlider
            className="horizontal-slider"
            thumbClassName="slider-thumb"
            trackClassName="slider-track"
            min={0}
            max={4}
            value={parseInt(profile[key]) || 0}
            onChange={(value) => handleSliderChange(key, value)}
          />
          <span>{preferenceLabels[parseInt(profile[key]) || 0]}</span>
        </div>
      ))}
      {preferences2.map(({ key, label }) => (
        <div className="field-group" key={key}>
          <label>{label}</label>
          <ReactSlider
            className="horizontal-slider"
            thumbClassName="slider-thumb"
            trackClassName="slider-track"
            min={0}
            max={4}
            value={parseInt(profile[key]) || 0}
            onChange={(value) => handleSliderChange(key, value)}
          />
          <span>{preference2[parseInt(profile[key]) || 0]}</span>
        </div>
      ))}

      <div className="field-group">
        <label>Gender Preference:</label>
        <ReactSlider
          className="horizontal-slider"
          thumbClassName="slider-thumb"
          trackClassName="slider-track"
          min={-3}
          max={3}
          value={parseInt(profile.genderScale) || 0}
          onChange={(value) => handleSliderChange("genderScale", value)}
        />
        <span>{genderLabels[(parseInt(profile.genderScale) || 0) + 3]}</span>
      </div>
    </>
  );
}

const religionOptions = ["Agnostic", "Atheist", "Christian", "Jewish", "Muslim", "Hindu", "Buddhist", "Spiritual", "No religion"];
const raceOptions = ["White", "Black or African American", "Hispanic or Latino", "Asian", "South Asian", "Middle Eastern", "Native American", "Pacific Islander", "Jewish"];

export default ProfilePage;