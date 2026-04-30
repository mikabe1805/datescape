// Geo helpers for the dating-distance feature.
// All distances are returned in miles to match the existing UI labels.

const EARTH_RADIUS_MILES = 3958.7613;

export function haversineMiles(latA, lngA, latB, lngB) {
  if (
    typeof latA !== "number" ||
    typeof lngA !== "number" ||
    typeof latB !== "number" ||
    typeof lngB !== "number"
  ) {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// Resolve the user's coarse location via the browser. Resolves to
// { lat, lng, accuracy } in degrees / meters, or rejects with a
// { code, message } object that callers can show inline.
export function getBrowserLocation({ timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({ code: "unsupported", message: "Geolocation isn't available in this browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const codeMap = {
          1: "permission_denied",
          2: "unavailable",
          3: "timeout",
        };
        const friendly = {
          permission_denied:
            "We couldn't read your location — permission was denied. You can type a city instead.",
          unavailable:
            "Location is temporarily unavailable. You can type a city instead.",
          timeout:
            "Location took too long. You can type a city instead.",
        };
        const code = codeMap[err.code] || "error";
        reject({ code, message: friendly[code] || err.message });
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs }
    );
  });
}

// Geocode a free-text city/region using Nominatim (OpenStreetMap).
// Free, no API key, but rate-limited (~1 req/sec) and unsuitable for heavy use.
// Good enough for one-shot signup entry.
export async function geocodeCity(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const hit = Array.isArray(json) && json[0];
    if (!hit) return null;
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      label: hit.display_name,
    };
  } catch {
    return null;
  }
}

// Reverse-geocode a lat/lng to a coarse city name.
export async function reverseGeocode(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) return null;
    const json = await res.json();
    const a = json?.address || {};
    const city = a.city || a.town || a.village || a.county || "";
    const region = a.state || a.region || "";
    const country = a.country || "";
    const label = [city, region, country].filter(Boolean).join(", ");
    return { city, region, country, label };
  } catch {
    return null;
  }
}

// Normalizes a location object to { lat, lng, city, source } or null.
export function normalizeLocation(loc) {
  if (!loc) return null;
  const lat = typeof loc.lat === "number" ? loc.lat : Number(loc.lat);
  const lng = typeof loc.lng === "number" ? loc.lng : Number(loc.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      city: loc.city || loc.label || "",
      source: loc.source || "manual",
    };
  }
  if (loc.city) {
    return { lat: null, lng: null, city: loc.city, source: loc.source || "manual" };
  }
  return null;
}

export const DISTANCE_NO_LIMIT = 100;
export const AGE_NO_LIMIT = 100;
