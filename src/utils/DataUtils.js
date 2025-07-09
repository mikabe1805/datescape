// DataUtils.js - Common data validation and transformation utilities

// Safe type conversion utilities
export function toNumber(val, fallback = 0) {
  if (val === null || val === undefined || val === "") return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

export function toString(val, fallback = "") {
  return typeof val === 'string' ? val : fallback;
}

export function toBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    return lower === 'yes' || lower === 'true' || lower === '1';
  }
  return Boolean(val);
}

export function toArray(val) {
  return Array.isArray(val) ? val : [];
}

// Data validation utilities
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateAge(age) {
  const numAge = toNumber(age);
  return numAge >= 18 && numAge <= 100;
}

export function validateRequiredFields(obj, requiredFields) {
  if (!obj || typeof obj !== 'object') return false;
  
  for (const field of requiredFields) {
    if (!obj[field]) return false;
  }
  
  return true;
}

// User profile validation
export function validateUserProfile(user) {
  if (!user || !user.uid) {
    console.warn("Invalid user data:", user);
    return false;
  }

  const requiredFields = ['displayName', 'age', 'gender', 'lookingFor'];
  
  if (!validateRequiredFields(user, requiredFields)) {
    console.warn(`User ${user.uid} missing required fields`);
    return false;
  }

  if (!validateAge(user.age)) {
    console.warn(`User ${user.uid} has invalid age: ${user.age}`);
    return false;
  }

  if (!toArray(user.media).length) {
    console.warn(`User ${user.uid} has no media files`);
    return false;
  }

  return true;
}

// Match validation
export function validateMatch(match, currentUserId) {
  if (!match || !match.id) return false;
  
  const other = currentUserId === match.userA ? match.userBProfile : match.userAProfile;
  if (!other) return false;
  
  if (!other.displayName && !other.name) return false;
  if (!toArray(other.media).length) return false;
  
  return true;
}

// Data cleaning utilities
export function cleanObject(obj) {
  if (!obj || typeof obj !== 'object') return {};
  
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => 
      v !== undefined && 
      v !== null && 
      v !== '' && 
      !(Array.isArray(v) && v.length === 0)
    )
  );
}

export function flattenUserData(docSnap, userId) {
  try {
    const data = docSnap.data();
    if (!data) {
      console.warn(`No data found for user ${userId}`);
      return null;
    }

    // Handle both flattened and nested profile structures
    const flattened = {
      uid: userId,
      ...(data.profile ?? {}),   // Pull fields out of legacy 'profile' map
      ...data,                   // Keep any already-flattened fields
    };

    // Ensure required fields exist with defaults
    const validated = {
      ...flattened,
      displayName: flattened.displayName || flattened.name || `User_${userId.slice(0, 8)}`,
      age: toNumber(flattened.age, 25),
      ageMin: toNumber(flattened.ageMin, 18),
      ageMax: toNumber(flattened.ageMax, 100),
      gender: toString(flattened.gender, 'Unknown'),
      lookingFor: toString(flattened.lookingFor, 'Dating'),
      interests: toArray(flattened.interests),
      races: toArray(flattened.races),
      religions: toArray(flattened.religions),
      media: toArray(flattened.media),
      isTrans: toString(flattened.isTrans, 'no'),
      isAsexual: toString(flattened.isAsexual, 'no'),
      children: toString(flattened.children, 'no'),
      substances: toString(flattened.substances, 'no'),
      politics: toString(flattened.politics, 'moderate'),
      transPref: toString(flattened.transPref, '2'),
      asexualPref: toString(flattened.asexualPref, '2'),
      childrenPref: toString(flattened.childrenPref, '0'),
      substancePref: toString(flattened.substancePref, '0'),
      politicsPref: toString(flattened.politicsPref, '0'),
      racePrefStrength: toString(flattened.racePrefStrength, '0'),
      heightDealbreaker: toString(flattened.heightDealbreaker, '0'),
      religionPref: toString(flattened.religionPref, '0'),
      genderPref: toString(flattened.genderPref, 'both'),
      hasReligionPref: toBoolean(flattened.hasReligionPref),
      hasRacePref: toBoolean(flattened.hasRacePref),
      hasHeightPref: toBoolean(flattened.hasHeightPref),
      selfHeight: toNumber(flattened.selfHeight, 66),
      heightMin: toNumber(flattened.heightMin, 48),
      heightMax: toNumber(flattened.heightMax, 84),
      racePreferences: toArray(flattened.racePreferences),
    };

    return validated;
  } catch (error) {
    console.error(`Error flattening user data for ${userId}:`, error);
    return null;
  }
}

// Match ID utilities
export function generateMatchId(userAId, userBId) {
  if (!userAId || !userBId) return null;
  return [userAId, userBId].sort().join("_");
}

export function parseMatchId(matchId) {
  if (!matchId || typeof matchId !== 'string') return null;
  const parts = matchId.split("_");
  if (parts.length !== 2) return null;
  return parts;
}

// Notification utilities
export function getNotificationSettings(userData) {
  if (!userData) return null;

  // Handle both old and new notification structure
  const notifications = userData.notifications || {};
  const notificationSettings = userData.notificationSettings || {};

  return {
    emailEnabled: toBoolean(notifications.emailEnabled || notificationSettings.emailNotifications),
    email: toString(notifications.email || notificationSettings.notificationEmail || userData.email),
    smsEnabled: toBoolean(notifications.smsEnabled || notificationSettings.smsNotifications),
    phone: toString(notifications.phone || notificationSettings.notificationPhone),
    lastMatchNotified: toString(notifications.lastMatchNotified),
    lastSessionNotified: toString(notifications.lastSessionNotified),
  };
}

// Error handling utilities
export function createError(message, code = 'UNKNOWN_ERROR', details = null) {
  return {
    message,
    code,
    details,
    timestamp: new Date().toISOString()
  };
}

export function logError(error, context = '') {
  console.error(`[${context}] Error:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    timestamp: error.timestamp,
    stack: error.stack
  });
}

// Rate limiting utilities
export class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = new Map();
  }

  canMakeRequest(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    // Remove old requests outside the time window
    const recentRequests = userRequests.filter(time => now - time < this.timeWindow);
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    return true;
  }

  reset(key) {
    this.requests.delete(key);
  }
}

// Cache utilities
export class SimpleCache {
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  clear() {
    this.cache.clear();
  }
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle utility
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
} 