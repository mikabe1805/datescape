// Local migration: races* -> ethnicities*
// Usage (PowerShell):
//   cd functions; $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"; node scripts\\migrateEthnicity.js

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function initAdmin() {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
  return getFirestore();
}

async function migrate() {
  const db = initAdmin();
  const usersSnap = await db.collection('users').get();
  let updated = 0;

  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data() || {};
    const profile = data.profile || {};

    const updates = {};
    const deletes = {};

    const srcEthnicities = profile.ethnicities || profile.races;
    if (srcEthnicities && !profile.ethnicities) {
      updates['profile.ethnicities'] = srcEthnicities;
      if (typeof profile.races !== 'undefined') deletes['profile.races'] = FieldValue.delete();
    }

    const srcPrefs = profile.ethnicityPreferences || profile.racePreferences;
    if (srcPrefs && !profile.ethnicityPreferences) {
      updates['profile.ethnicityPreferences'] = srcPrefs;
      if (typeof profile.racePreferences !== 'undefined') deletes['profile.racePreferences'] = FieldValue.delete();
    }

    const strength = profile.ethnicityPrefStrength || profile.racePrefStrength;
    if (typeof strength !== 'undefined' && typeof profile.ethnicityPrefStrength === 'undefined') {
      updates['profile.ethnicityPrefStrength'] = strength;
      if (typeof profile.racePrefStrength !== 'undefined') deletes['profile.racePrefStrength'] = FieldValue.delete();
    }

    const hasPref = typeof profile.hasEthnicityPref !== 'undefined' ? profile.hasEthnicityPref : profile.hasRacePref;
    if (typeof hasPref !== 'undefined' && typeof profile.hasEthnicityPref === 'undefined') {
      updates['profile.hasEthnicityPref'] = hasPref;
      if (typeof profile.hasRacePref !== 'undefined') deletes['profile.hasRacePref'] = FieldValue.delete();
    }

    const dealbreaker = typeof profile.ethnicityDealbreaker !== 'undefined' ? profile.ethnicityDealbreaker : profile.raceDealbreaker;
    if (typeof dealbreaker !== 'undefined' && typeof profile.ethnicityDealbreaker === 'undefined') {
      updates['profile.ethnicityDealbreaker'] = dealbreaker;
      if (typeof profile.raceDealbreaker !== 'undefined') deletes['profile.raceDealbreaker'] = FieldValue.delete();
    }

    if (Object.keys(updates).length || Object.keys(deletes).length) {
      await docSnap.ref.update({ ...updates, ...deletes, 'profile._migratedEthnicity': true });
      updated += 1;
      process.stdout.write('.');
    }
  }

  console.log(`\nDone. Updated ${updated} of ${usersSnap.size} user documents.`);
}

migrate().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});


