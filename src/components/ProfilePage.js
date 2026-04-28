import React, { useEffect, useMemo, useState } from "react";
import { Bell, Camera, Compass, Sparkles } from "lucide-react";
import {
  auth,
  db,
  storage,
  disableMessagingForCurrentUser,
  getPushPermissionState,
  initMessagingForCurrentUser
} from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { generateMatchesForUser } from "../firebase/generateMatchesForUser";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import Select from "react-select";
import ReactSlider from "react-slider";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "../ProfilePage.css";
import "../Slider.css";
import { uploadMediaFiles } from "../utils/UploadMedia";
import { flattenUserData, getNotificationSettings, validateEmail } from "../utils/DataUtils";
import {
  getPwaInstallState,
  promptForInstall,
  subscribePwaInstallState
} from "../utils/pwaInstall";

const PROFILE_FIELDS = [
  "displayName",
  "bio",
  "gender",
  "lookingFor",
  "politics",
  "substances",
  "children",
  "isTrans",
  "isAsexual",
  "selfHeight",
  "religions",
  "ethnicities",
  "ageMin",
  "ageMax",
  "distMin",
  "distMax",
  "hasEthnicityPref",
  "ethnicityPreferences",
  "ethnicityPrefStrength",
  "hasHeightPref",
  "heightMin",
  "heightMax",
  "heightDealbreaker",
  "genderPref",
  "genderScale",
  "transPref",
  "asexualPref",
  "religionPref",
  "childrenPref",
  "substancePref",
  "politicsPref",
  "media"
];

const MATCH_FIELDS = new Set([
  "gender",
  "lookingFor",
  "politics",
  "substances",
  "children",
  "isTrans",
  "isAsexual",
  "selfHeight",
  "religions",
  "ethnicities",
  "ageMin",
  "ageMax",
  "distMin",
  "distMax",
  "hasEthnicityPref",
  "ethnicityPreferences",
  "ethnicityPrefStrength",
  "hasHeightPref",
  "heightMin",
  "heightMax",
  "heightDealbreaker",
  "genderPref",
  "genderScale",
  "transPref",
  "asexualPref",
  "religionPref",
  "childrenPref",
  "substancePref",
  "politicsPref",
  "media"
]);

const religionOptions = [
  "Agnostic",
  "Atheist",
  "Christian",
  "Jewish",
  "Muslim",
  "Hindu",
  "Buddhist",
  "Spiritual",
  "No religion"
];

const ethnicityOptions = [
  "Black or African American",
  "White",
  "Hispanic or Latino",
  "East Asian",
  "South Asian",
  "Southeast Asian",
  "Middle Eastern",
  "North African",
  "Native American or Alaska Native",
  "Native Hawaiian or Other Pacific Islander",
  "Jewish",
  "Mixed / Multiracial",
  "Other"
];

const importanceLabels = ["No preference", "Weak", "Strong", "Dealbreaker"];
const identityPreferenceLabels = [
  "Dealbreaker",
  "Prefer not",
  "No preference",
  "Prefer",
  "Necessary"
];
const genderLabels = [
  "Strongly prefer men",
  "Prefer men",
  "Slightly prefer men",
  "No preference",
  "Slightly prefer women",
  "Prefer women",
  "Strongly prefer women"
];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 48,
    borderRadius: 14,
    borderColor: state.isFocused ? "rgba(245, 201, 115, 0.34)" : "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.08)",
    boxShadow: state.isFocused ? "0 0 0 4px rgba(245,201,115,0.08)" : "none",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(14,28,23,0.96)",
    border: "1px solid rgba(255,255,255,0.08)"
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "rgba(255,255,255,0.08)" : "transparent",
    color: "#fff4df",
    cursor: "pointer"
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 999,
    backgroundColor: "rgba(245,201,115,0.14)"
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "#fff4df"
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#fff4df",
    ":hover": {
      backgroundColor: "rgba(245,201,115,0.22)",
      color: "#fff4df"
    }
  }),
  singleValue: (base) => ({
    ...base,
    color: "#fff4df"
  }),
  input: (base) => ({
    ...base,
    color: "#fff4df"
  }),
  placeholder: (base) => ({
    ...base,
    color: "rgba(255,255,255,0.55)"
  })
};

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, safeValue));
}

function normalizeRange(minValue, maxValue, bounds) {
  let safeMin = clampNumber(minValue, bounds.min, bounds.max, bounds.fallbackMin);
  let safeMax = clampNumber(maxValue, bounds.min, bounds.max, bounds.fallbackMax);

  if (safeMin > safeMax) {
    [safeMin, safeMax] = [safeMax, safeMin];
  }

  return [safeMin, safeMax];
}

function normalizeProfile(profile) {
  if (!profile) return profile;

  const [ageMin, ageMax] = normalizeRange(profile.ageMin, profile.ageMax, {
    min: 18,
    max: 100,
    fallbackMin: 18,
    fallbackMax: 100
  });
  const [distMin, distMax] = normalizeRange(profile.distMin, profile.distMax, {
    min: 0,
    max: 100,
    fallbackMin: 0,
    fallbackMax: 100
  });
  const [heightMin, heightMax] = normalizeRange(profile.heightMin, profile.heightMax, {
    min: 48,
    max: 84,
    fallbackMin: 48,
    fallbackMax: 84
  });

  return {
    ...profile,
    selfHeight: clampNumber(profile.selfHeight, 48, 84, 66),
    ageMin,
    ageMax,
    distMin,
    distMax,
    heightMin,
    heightMax
  };
}

function getProfileCompletion(profile, pendingMediaCount = 0) {
  const checks = [
    Boolean(profile?.displayName?.trim()),
    Boolean(profile?.bio?.trim()),
    Boolean(profile?.gender),
    Boolean(profile?.lookingFor),
    Boolean(profile?.politics),
    Boolean(profile?.substances),
    Boolean(profile?.children),
    ((profile?.media?.length || 0) + pendingMediaCount) >= 2,
    Boolean(profile?.religions?.length),
    Boolean(profile?.ethnicities?.length)
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

function ProfilePage() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const [profile, setProfile] = useState(null);
  const [originalProfile, setOriginalProfile] = useState(null);
  const [notificationSettings, setNotificationSettings] = useState({
    emailEnabled: false,
    email: "",
    useLoginEmail: false,
    smsEnabled: false,
    phone: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [installState, setInstallState] = useState(getPwaInstallState());
  const [installBusy, setInstallBusy] = useState(false);

  const pendingMediaPreviews = useMemo(
    () => mediaFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [mediaFiles]
  );

  useEffect(() => {
    return () => {
      pendingMediaPreviews.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [pendingMediaPreviews]);

  useEffect(() => subscribePwaInstallState(setInstallState), []);

  useEffect(() => {
    const refreshPushState = async () => {
      const permission = getPushPermissionState();
      if (permission === "unsupported") {
        setPushStatus("unsupported");
        return;
      }

      if (permission === "granted") {
        const result = await initMessagingForCurrentUser();
        setPushStatus(result?.status === "granted" ? "enabled" : result?.status || "error");
        return;
      }

      setPushStatus(permission === "default" ? "permission_required" : permission);
    };

    refreshPushState();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }

        const nextProfile = normalizeProfile(flattenUserData(userSnap, user.uid));
        const nextNotifications = getNotificationSettings(userSnap.data(), user.email);
        setProfile(nextProfile);
        setOriginalProfile(JSON.parse(JSON.stringify(nextProfile)));
        setNotificationSettings(nextNotifications);
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumericChange = (name, value) => {
    setProfile((prev) => ({ ...prev, [name]: Number(value) }));
  };

  const handlePreferenceChange = (name, value) => {
    setProfile((prev) => ({ ...prev, [name]: String(value) }));
  };

  const handleMultiSelectChange = (name, selectedOptions) => {
    setProfile((prev) => ({
      ...prev,
      [name]: (selectedOptions || []).map((option) => option.value)
    }));
  };

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    const totalAllowed = 6 - ((profile?.media?.length || 0) + mediaFiles.length);

    if (selectedFiles.length > totalAllowed) {
      alert(`You can only upload ${totalAllowed} more media file(s).`);
      return;
    }

    const maxImageSize = 50 * 1024 * 1024;
    const maxVideoSize = 100 * 1024 * 1024;
    const supportedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const supportedVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];

    const validFiles = [];
    const invalidFiles = [];

    selectedFiles.forEach((file) => {
      const isValidImage = supportedImageTypes.includes(file.type);
      const isValidVideo = supportedVideoTypes.includes(file.type);

      if (!isValidImage && !isValidVideo) {
        invalidFiles.push(`${file.name}: unsupported file type`);
        return;
      }

      const sizeLimit = isValidVideo ? maxVideoSize : maxImageSize;
      if (file.size > sizeLimit) {
        invalidFiles.push(`${file.name}: file too large`);
        return;
      }

      validFiles.push(file);
    });

    if (invalidFiles.length) {
      alert(`Some files were rejected:\n${invalidFiles.join("\n")}`);
    }

    if (validFiles.length) {
      setMediaFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleDeleteMedia = async (url) => {
    if (!user || !profile) return;
    if ((profile.media || []).length <= 1) {
      alert("You must keep at least one uploaded image or video.");
      return;
    }
    if (!window.confirm("Delete this media item?")) return;

    try {
      const encodedPath = decodeURIComponent(new URL(url).pathname.split("/o/")[1].split("?")[0]);
      await deleteObject(ref(storage, encodedPath));

      const updatedMedia = (profile.media || []).filter((item) => item !== url);
      await updateDoc(doc(db, "users", user.uid), { media: updatedMedia });

      setProfile((prev) => ({ ...prev, media: updatedMedia }));
      setOriginalProfile((prev) => (prev ? { ...prev, media: updatedMedia } : prev));
    } catch (error) {
      console.error("Failed to delete media:", error);
      alert("Failed to delete media.");
    }
  };

  const deleteExistingMatches = async (userId) => {
    const activeAsUserA = query(
      collection(db, "matches"),
      where("userA", "==", userId),
      where("isActiveA", "==", true)
    );
    const activeAsUserB = query(
      collection(db, "matches"),
      where("userB", "==", userId),
      where("isActiveB", "==", true)
    );

    const [snapA, snapB] = await Promise.all([getDocs(activeAsUserA), getDocs(activeAsUserB)]);
    const allDocs = [...snapA.docs, ...snapB.docs];
    await Promise.all(allDocs.map((matchDoc) => deleteDoc(matchDoc.ref)));
  };

  const collectProfileUpdates = (nextProfile) => {
    const updates = {};
    const changedFields = [];

    PROFILE_FIELDS.forEach((field) => {
      const before = originalProfile?.[field] ?? null;
      const after = nextProfile?.[field] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        updates[field] = after;
        changedFields.push(field);
      }
    });

    return { updates, changedFields };
  };

  const handleSave = async () => {
    if (!user || !profile) return;

    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const nextProfile = normalizeProfile({ ...profile });

      if (mediaFiles.length) {
        const currentMedia = nextProfile.media || [];
        if (currentMedia.length + mediaFiles.length > 6) {
          alert("You can only upload 6 media files total.");
          setSaving(false);
          return;
        }

        const uploadedMedia = await uploadMediaFiles(user.uid, mediaFiles);
        nextProfile.media = [...currentMedia, ...uploadedMedia];
      }

      const { updates, changedFields } = collectProfileUpdates(nextProfile);
      if (!changedFields.length) {
        setMediaFiles([]);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1200);
        return;
      }

      await updateDoc(userRef, updates);

      const shouldRebuildMatches = changedFields.some((field) => MATCH_FIELDS.has(field));
      if (shouldRebuildMatches) {
        await deleteExistingMatches(user.uid);
        await generateMatchesForUser({ uid: user.uid, ...nextProfile }, user.uid);
      }

      setProfile(nextProfile);
      setOriginalProfile(JSON.parse(JSON.stringify(nextProfile)));
      setMediaFiles([]);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 1200);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user) return;

    const email = notificationSettings.useLoginEmail
      ? user.email || ""
      : notificationSettings.email.trim();

    if (notificationSettings.emailEnabled && !validateEmail(email)) {
      alert("Please enter a valid notification email.");
      return;
    }

    if (notificationSettings.smsEnabled && !notificationSettings.phone) {
      alert("Please enter a valid phone number.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", user.uid), {
        "notifications.emailEnabled": notificationSettings.emailEnabled,
        "notifications.email": email,
        "notifications.smsEnabled": notificationSettings.smsEnabled,
        "notifications.phone": notificationSettings.phone || "",
        "notifications.notifiedWhileInactive": false,
        "notifications.notifiedMatchWhileInactive": false
      });

      setNotificationSettings((prev) => ({ ...prev, email }));
      setShowNotificationModal(false);
    } catch (error) {
      console.error("Failed to save notification settings:", error);
      alert("Failed to save settings.");
    }
  };

  const enablePushOnThisDevice = async () => {
    setPushBusy(true);
    try {
      const result = await initMessagingForCurrentUser({ requestPermission: true });
      setPushStatus(result?.status === "granted" ? "enabled" : result?.status || "error");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePushOnThisDevice = async () => {
    setPushBusy(true);
    try {
      await disableMessagingForCurrentUser();
      setPushStatus(getPushPermissionState() === "denied" ? "denied" : "disabled");
    } finally {
      setPushBusy(false);
    }
  };

  const installApp = async () => {
    setInstallBusy(true);
    try {
      await promptForInstall();
      setInstallState(getPwaInstallState());
    } finally {
      setInstallBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete your account? This cannot be undone.")) return;

    try {
      await deleteExistingMatches(user.uid);
      await deleteDoc(doc(db, "users", user.uid));
      await user.delete();
      navigate("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to delete account.");
    }
  };

  const handleLogout = async () => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid), { active: false });
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Failed to sign out.");
    }
  };

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  if (loading) return <div className="loading-screen">Loading profile...</div>;
  if (!profile) return <div className="error-screen">No profile found.</div>;

  const ageRange = [profile.ageMin, profile.ageMax];
  const distanceRange = [profile.distMin, profile.distMax];
  const heightRange = [profile.heightMin, profile.heightMax];
  const currentMediaCount = (profile.media || []).length + mediaFiles.length;
  const profileCompletion = getProfileCompletion(profile, mediaFiles.length);
  const changedFields = originalProfile ? collectProfileUpdates(profile).changedFields : [];
  const hasPendingChanges = changedFields.length > 0 || mediaFiles.length > 0;
  const pendingChangeCount = changedFields.length + (mediaFiles.length > 0 ? 1 : 0);
  const pushStatusLabel = {
    enabled: "Enabled on this device",
    granted: "Enabled on this device",
    disabled: "Disabled on this device",
    denied: "Blocked by the browser",
    permission_required: "Permission has not been granted yet",
    unsupported: "This browser or origin cannot receive push",
    missing_vapid_key: "Push key is not configured",
    token_unavailable: "The device token is not available yet",
    checking: "Checking device status...",
    error: "Push setup failed"
  }[pushStatus] || "Unknown";
  const installStatusLabel = installState.isInstalled
    ? "Installed"
    : installState.canInstall
      ? "Ready to install"
      : installState.needsManualInstall
        ? "Install from the browser share menu"
        : "Install not available in this browser yet";
  const overviewCards = [
    {
      icon: <Sparkles size={18} />,
      label: "Profile strength",
      value: `${profileCompletion}%`,
      detail: hasPendingChanges ? "Unsaved changes waiting" : "Ready for matching"
    },
    {
      icon: <Camera size={18} />,
      label: "Media",
      value: `${currentMediaCount}/6`,
      detail: currentMediaCount >= 2 ? "Enough to feel complete" : "Add at least 2 items"
    },
    {
      icon: <Compass size={18} />,
      label: "Queue range",
      value: `${ageRange[0]}-${ageRange[1]} / ${distanceRange[1]} mi`,
      detail: `${profile.genderPref || "all"} • ${profile.lookingFor || "both"}`
    },
    {
      icon: <Bell size={18} />,
      label: "Device alerts",
      value: pushStatus === "enabled" || pushStatus === "granted" ? "On" : "Off",
      detail: installState.isInstalled ? "App installed" : installStatusLabel
    }
  ];
  const sectionLinks = [
    { id: "profile-basics", label: "Basics" },
    { id: "profile-lifestyle", label: "Lifestyle" },
    { id: "profile-media", label: "Media" },
    { id: "profile-compatibility", label: "Compatibility" }
  ];

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-hero">
          <div className="profile-hero__copy">
            <p className="profile-eyebrow">Account</p>
            <h2>Edit Profile</h2>
            <p className="profile-subtitle">Clean up the basics, tune compatibility, and keep notifications under control.</p>
            <div className="profile-status-row">
              <span className="profile-status-pill">{pushStatusLabel}</span>
              <span className="profile-status-pill">{installStatusLabel}</span>
              <span className={`profile-status-pill ${hasPendingChanges ? "profile-status-pill--attention" : ""}`}>
                {hasPendingChanges ? "Changes waiting to save" : "All changes saved"}
              </span>
            </div>
          </div>
          <div className="profile-hero__actions">
            <button className="glass-btn" onClick={() => setShowNotificationModal(true)} disabled={saving}>
              Notification Settings
            </button>
            <button className="glass-btn" onClick={() => navigate("/app/match-queue")} disabled={saving}>
              Open Match Queue
            </button>
          </div>
        </div>

        <div className="profile-overview-grid">
          {overviewCards.map((card) => (
            <div key={card.label} className="profile-overview-card">
              <div className="profile-overview-card__icon">{card.icon}</div>
              <div>
                <p className="profile-overview-card__label">{card.label}</p>
                <p className="profile-overview-card__value">{card.value}</p>
                <p className="profile-overview-card__detail">{card.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="profile-section-nav" aria-label="Profile sections">
          {sectionLinks.map((section) => (
            <button
              key={section.id}
              type="button"
              className="profile-section-nav__button"
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>

        <section className="profile-section" id="profile-basics">
          <div className="profile-section__header">
            <h3>Basics</h3>
            <p>Keep your public profile clear and current.</p>
          </div>
          <div className="field-grid">
            <div className="field-group">
              <label>Display Name</label>
              <input name="displayName" value={profile.displayName || ""} onChange={handleInputChange} />
            </div>

            <div className="field-group">
              <label>Looking For</label>
              <select name="lookingFor" value={profile.lookingFor || "Both"} onChange={handleInputChange}>
                <option value="Friendship">Friendship</option>
                <option value="Dating">Dating</option>
                <option value="Both">Both</option>
              </select>
            </div>

            <div className="field-group">
              <label>Gender</label>
              <select name="gender" value={profile.gender || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="Man">Man</option>
                <option value="Woman">Woman</option>
                <option value="Nonbinary">Nonbinary</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="field-group">
            <label>Bio</label>
            <textarea name="bio" value={profile.bio || ""} onChange={handleInputChange} rows={4} />
          </div>
        </section>

        <section className="profile-section" id="profile-lifestyle">
          <div className="profile-section__header">
            <h3>Identity and Lifestyle</h3>
            <p>These fields shape how your card reads and how others filter.</p>
          </div>
          <div className="field-grid">
            <div className="field-group">
              <label>Politics</label>
              <select name="politics" value={profile.politics || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="apolitical">Apolitical</option>
              </select>
            </div>

            <div className="field-group">
              <label>Substances</label>
              <select name="substances" value={profile.substances || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="none">Don't use</option>
                <option value="socially">Socially / Occasionally</option>
                <option value="frequent">Frequently</option>
              </select>
            </div>

            <div className="field-group">
              <label>Children</label>
              <select name="children" value={profile.children || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="later">Later</option>
                <option value="no">No</option>
                <option value="undecided">Undecided</option>
              </select>
            </div>

            <div className="field-group">
              <label>Transgender</label>
              <select name="isTrans" value={profile.isTrans || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className="field-group">
              <label>Asexual</label>
              <select name="isAsexual" value={profile.isAsexual || ""} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className="field-group">
              <label>Religions</label>
              <Select
                isMulti
                options={religionOptions.map((value) => ({ value, label: value }))}
                value={(profile.religions || []).map((value) => ({ value, label: value }))}
                onChange={(selected) => handleMultiSelectChange("religions", selected)}
                styles={selectStyles}
              />
            </div>

            <div className="field-group field-group-full">
              <label>Ethnicities</label>
              <Select
                isMulti
                options={ethnicityOptions.map((value) => ({ value, label: value }))}
                value={(profile.ethnicities || []).map((value) => ({ value, label: value }))}
                onChange={(selected) => handleMultiSelectChange("ethnicities", selected)}
                menuPortalTarget={document.body}
                styles={selectStyles}
              />
            </div>
          </div>

          <div className="slider-group">
            <label>Your Height</label>
            <ReactSlider
              className="range-slider"
              thumbClassName="range-thumb"
              trackClassName="range-track"
              min={48}
              max={84}
              step={1}
              value={profile.selfHeight}
              onChange={(value) => handleNumericChange("selfHeight", value)}
            />
            <p className="slider-label">{formatHeight(profile.selfHeight)}</p>
          </div>
        </section>

        <section className="profile-section" id="profile-media">
          <div className="profile-section__header">
            <h3>Media</h3>
            <p>Lead with strong photos and keep the gallery current.</p>
          </div>
          <div className="media-upload-panel">
            <div>
              <p className="media-upload-panel__title">Upload images or video</p>
              <p className="media-upload-panel__copy">
                Aim for at least two clear images. You can keep up to six total photos or videos.
              </p>
            </div>
            <div className="media-upload-panel__meta">{currentMediaCount}/6 items selected</div>
          </div>
          <div className="field-group">
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} />
          </div>

          <div className="media-preview">
            <strong>Current media</strong>
            <div className="media-grid">
              {(profile.media || []).map((url, index) => (
                <div key={url} className="media-thumbnail">
                  {isVideoUrl(url) ? (
                    <video src={url} controls preload="metadata" width="150" height="150" />
                  ) : (
                    <img src={url} alt={`media-${index}`} width="150" height="150" />
                  )}
                  <button className="media-action" onClick={() => handleDeleteMedia(url)}>Delete</button>
                </div>
              ))}
            </div>
          </div>

          {pendingMediaPreviews.length > 0 && (
            <div className="media-preview">
              <strong>Pending uploads</strong>
              <div className="media-grid">
                {pendingMediaPreviews.map(({ file, url }, index) => (
                  <div key={`${file.name}-${index}`} className="media-thumbnail">
                    {file.type.startsWith("video") ? (
                      <video src={url} controls width="150" height="150" />
                    ) : (
                      <img src={url} alt={`pending-${index}`} width="150" height="150" />
                    )}
                    <button
                      className="media-action"
                      onClick={() => setMediaFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="profile-section" id="profile-compatibility">
          <div className="profile-section__header">
            <h3>Compatibility</h3>
            <p>These preferences drive queue quality and scoring.</p>
          </div>

          <div className="field-grid">
            <div className="field-group">
              <label>Gender Preference</label>
              <select name="genderPref" value={profile.genderPref || "all"} onChange={handleInputChange}>
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="all">All</option>
              </select>
            </div>

            <div className="field-group">
              <label>Ethnicity Preference</label>
              <select
                name="hasEthnicityPref"
                value={profile.hasEthnicityPref ? "yes" : "no"}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    hasEthnicityPref: event.target.value === "yes"
                  }))
                }
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div className="field-group">
              <label>Height Preference</label>
              <select
                name="hasHeightPref"
                value={profile.hasHeightPref ? "yes" : "no"}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    hasHeightPref: event.target.value === "yes"
                  }))
                }
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>

          <div className="slider-group">
            <label>Preferred age range</label>
            <ReactSlider
              className="range-slider"
              thumbClassName="range-thumb"
              trackClassName="range-track"
              min={18}
              max={100}
              step={1}
              value={ageRange}
              onChange={([min, max]) => {
                handleNumericChange("ageMin", min);
                handleNumericChange("ageMax", max);
              }}
            />
            <p className="slider-label">{ageRange[0]} - {ageRange[1]}</p>
          </div>

          <div className="slider-group">
            <label>Preferred distance range (miles)</label>
            <ReactSlider
              className="range-slider"
              thumbClassName="range-thumb"
              trackClassName="range-track"
              min={0}
              max={100}
              step={1}
              value={distanceRange}
              onChange={([min, max]) => {
                handleNumericChange("distMin", min);
                handleNumericChange("distMax", max);
              }}
            />
            <p className="slider-label">{distanceRange[0]} - {distanceRange[1]} miles</p>
          </div>

          {profile.hasEthnicityPref && (
            <>
              <div className="field-group">
                <label>Preferred ethnicities</label>
                <Select
                  isMulti
                  options={ethnicityOptions.map((value) => ({ value, label: value }))}
                  value={(profile.ethnicityPreferences || []).map((value) => ({ value, label: value }))}
                  onChange={(selected) => handleMultiSelectChange("ethnicityPreferences", selected)}
                  menuPortalTarget={document.body}
                  styles={selectStyles}
                />
              </div>
              <PreferenceSlider
                label="Ethnicity importance"
                value={profile.ethnicityPrefStrength || "0"}
                max={3}
                labels={importanceLabels}
                onChange={(value) => handlePreferenceChange("ethnicityPrefStrength", value)}
              />
            </>
          )}

          {profile.hasHeightPref && (
            <>
              <div className="slider-group">
                <label>Preferred height range</label>
                <ReactSlider
                  className="range-slider"
                  thumbClassName="range-thumb"
                  trackClassName="range-track"
                  min={48}
                  max={84}
                  step={1}
                  value={heightRange}
                  onChange={([min, max]) => {
                    handleNumericChange("heightMin", min);
                    handleNumericChange("heightMax", max);
                  }}
                />
                <p className="slider-label">{formatHeight(heightRange[0])} - {formatHeight(heightRange[1])}</p>
              </div>
              <PreferenceSlider
                label="Height importance"
                value={profile.heightDealbreaker || "0"}
                max={3}
                labels={importanceLabels}
                onChange={(value) => handlePreferenceChange("heightDealbreaker", value)}
              />
            </>
          )}

          <PreferenceSlider
            label="Religion importance"
            value={profile.religionPref || "0"}
            max={3}
            labels={importanceLabels}
            onChange={(value) => handlePreferenceChange("religionPref", value)}
          />

          <PreferenceSlider
            label="Politics importance"
            value={profile.politicsPref || "0"}
            max={3}
            labels={importanceLabels}
            onChange={(value) => handlePreferenceChange("politicsPref", value)}
          />

          <PreferenceSlider
            label="Substance importance"
            value={profile.substancePref || "0"}
            max={3}
            labels={importanceLabels}
            onChange={(value) => handlePreferenceChange("substancePref", value)}
          />

          <PreferenceSlider
            label="Children importance"
            value={profile.childrenPref || "0"}
            max={3}
            labels={importanceLabels}
            onChange={(value) => handlePreferenceChange("childrenPref", value)}
          />

          <PreferenceSlider
            label="Trans preference"
            value={profile.transPref || "2"}
            max={4}
            labels={identityPreferenceLabels}
            onChange={(value) => handlePreferenceChange("transPref", value)}
          />

          <PreferenceSlider
            label="Asexual preference"
            value={profile.asexualPref || "2"}
            max={4}
            labels={identityPreferenceLabels}
            onChange={(value) => handlePreferenceChange("asexualPref", value)}
          />

          <PreferenceSlider
            label="Gender lean"
            value={profile.genderScale || "0"}
            min={-3}
            max={3}
            labels={genderLabels}
            onChange={(value) => handlePreferenceChange("genderScale", value)}
            formatter={(value) => genderLabels[Number(value) + 3]}
          />
        </section>

        <div className="profile-savebar">
          <div className="profile-savebar__copy">
            <p className="profile-savebar__label">Profile updates</p>
            <p className="profile-savebar__text">
              {saveSuccess
                ? "Saved successfully."
                : hasPendingChanges
                  ? `${pendingChangeCount} update${pendingChangeCount === 1 ? "" : "s"} ready to save.`
                  : "No unsaved changes right now."}
            </p>
          </div>
          <div className="profile-savebar__actions">
            <button
              className="glass-btn"
              onClick={() => {
                if (!originalProfile) return;
                setProfile(JSON.parse(JSON.stringify(originalProfile)));
                setMediaFiles([]);
              }}
              disabled={saving || !hasPendingChanges}
            >
              Revert
            </button>
            <button className="glass-btn glass-btn--primary" onClick={handleSave} disabled={saving || !hasPendingChanges}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="button-group button-group--account">
          <button className="glass-btn" onClick={handleLogout} disabled={saving}>
            Log Out
          </button>
          <button className="glass-btn danger-btn" onClick={handleDeleteAccount} disabled={saving}>
            Delete Account
          </button>
        </div>
      </div>

      {showNotificationModal && (
        <div className="settings-modal-backdrop" onClick={() => setShowNotificationModal(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div>
                <p className="profile-eyebrow">Notifications</p>
                <h3>Delivery Preferences</h3>
              </div>
              <button className="glass-btn" onClick={() => setShowNotificationModal(false)}>Close</button>
            </div>

            <p className="settings-note">
              Email alerts only fire while you are inactive. Check spam if you are testing delivery.
            </p>

            <div className="settings-group">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationSettings.emailEnabled}
                  onChange={(event) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      emailEnabled: event.target.checked
                    }))
                  }
                />
                <span>Email notifications</span>
              </label>

              {notificationSettings.emailEnabled && (
                <div className="settings-panel">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={notificationSettings.useLoginEmail}
                      onChange={(event) =>
                        setNotificationSettings((prev) => ({
                          ...prev,
                          useLoginEmail: event.target.checked,
                          email: event.target.checked ? user?.email || "" : prev.email
                        }))
                      }
                    />
                    <span>Use login email ({user?.email || "none"})</span>
                  </label>
                  {!notificationSettings.useLoginEmail && (
                    <input
                      type="email"
                      value={notificationSettings.email}
                      onChange={(event) =>
                        setNotificationSettings((prev) => ({ ...prev, email: event.target.value }))
                      }
                      placeholder="Notification email"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="settings-group">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationSettings.smsEnabled}
                  onChange={(event) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      smsEnabled: event.target.checked
                    }))
                  }
                />
                <span>SMS notifications</span>
              </label>

              {notificationSettings.smsEnabled && (
                <div className="settings-panel">
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={notificationSettings.phone}
                    onChange={(value) =>
                      setNotificationSettings((prev) => ({ ...prev, phone: value || "" }))
                    }
                  />
                </div>
              )}
            </div>

            <div className="settings-group">
              <div className="settings-panel">
                <div className="settings-header">
                  <div>
                    <p className="profile-eyebrow">Push on this device</p>
                    <h3>Browser and phone alerts</h3>
                  </div>
                </div>
                <p className="settings-note">
                  {pushStatusLabel}. Physical phone testing needs the app served over HTTPS or deployed hosting.
                </p>
                <div className="settings-actions">
                  <button className="glass-btn" onClick={enablePushOnThisDevice} disabled={pushBusy}>
                    {pushBusy ? "Working..." : pushStatus === "enabled" ? "Re-register device" : "Enable push"}
                  </button>
                  <button
                    className="glass-btn"
                    onClick={disablePushOnThisDevice}
                    disabled={pushBusy || !["enabled", "granted"].includes(pushStatus)}
                  >
                    Disable on this device
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-panel">
                <div className="settings-header">
                  <div>
                    <p className="profile-eyebrow">Install</p>
                    <h3>Home screen app</h3>
                  </div>
                </div>
                <p className="settings-note">
                  {installState.isInstalled
                    ? "DateScape is already installed in standalone mode on this device."
                    : installState.canInstall
                      ? "This browser is ready to install the app."
                      : installState.needsManualInstall
                        ? "On iPhone, use Share and then Add to Home Screen."
                        : "If install is not available here, use the browser install option from the deployed HTTPS app."}
                </p>
                {installState.needsManualInstall && (
                  <ol className="settings-steps">
                    <li>Open the browser share menu.</li>
                    <li>Choose <strong>Add to Home Screen</strong>.</li>
                    <li>Confirm the name and save it.</li>
                  </ol>
                )}
                <div className="settings-actions">
                  <button
                    className="glass-btn"
                    onClick={installApp}
                    disabled={installBusy || installState.isInstalled || !installState.canInstall}
                  >
                    {installBusy ? "Opening..." : installState.isInstalled ? "Installed" : "Install app"}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button className="glass-btn" onClick={() => setShowNotificationModal(false)}>Cancel</button>
              <button className="glass-btn" onClick={handleSaveNotifications}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferenceSlider({ label, value, labels, onChange, min = 0, max = 3, formatter }) {
  const numericValue = Number(value ?? 0);

  return (
    <div className="slider-group">
      <label>{label}</label>
      <ReactSlider
        className="horizontal-slider"
        thumbClassName="slider-thumb"
        trackClassName="slider-track"
        min={min}
        max={max}
        value={numericValue}
        onChange={(nextValue) => onChange(nextValue)}
      />
      <span className="slider-caption">
        {formatter ? formatter(numericValue) : labels[numericValue - min]}
      </span>
    </div>
  );
}

function isVideoUrl(url) {
  return [".mp4", ".webm", ".mov", ".quicktime", ".m4v"].some((extension) =>
    url.toLowerCase().includes(extension)
  );
}

function formatHeight(height) {
  const feet = Math.floor(height / 12);
  const inches = height % 12;
  return `${feet}'${inches}"`;
}

export default ProfilePage;
