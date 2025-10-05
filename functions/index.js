const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const sgMail = require("@sendgrid/mail");
const { defineSecret } = require("firebase-functions/params");

initializeApp();
const db = getFirestore();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const MIGRATION_SECRET = defineSecret("MIGRATION_SECRET");

// Helper to send email via SendGrid
async function sendEmail(to, subject, text) {
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_KEY || !SENDGRID_KEY.startsWith("SG.")) {
    console.error("[SendGrid] Missing or invalid API key.");
    return;
  }
  sgMail.setApiKey(SENDGRID_KEY);
  await sgMail.send({ to, from: "datescapenotifications@gmail.com", subject, text });
  console.log(`[SendGrid] Email sent to ${to}`);
}

// Match Activated Trigger
exports.notifyOnMatchActivated = onDocumentUpdated(
  {
    document: "matches/{matchId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before.matched && after.matched) {
      const matchId = event.params.matchId;
      const { userIds } = after;
      await Promise.all(userIds.map(async (userId) => {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        if (!userData || !userData.notifications) return;
        const lastActive = userData.lastActive?.toDate ? userData.lastActive.toDate() : null;
        const minutesSinceActive = lastActive ? (Date.now() - lastActive.getTime()) / 60000 : null;
        const consideredInactive = minutesSinceActive === null || minutesSinceActive > 5;
        if (!consideredInactive) return;

        const email = userData.notifications.emailEnabled && userData.notifications.email;
        const notifiedMatchWhileInactive = userData.notifications.notifiedMatchWhileInactive || false;
        const shouldSendEmail = email && consideredInactive && !notifiedMatchWhileInactive;
        const message = "You have a new match on DateScape!";

        const notificationsRef = db.collection("users").doc(userId).collection("notifications");
        const existing = await notificationsRef
          .where("type", "==", "new_match").where("matchId", "==", matchId)
          .where("read", "==", false).limit(1).get();
        const writes = [];
        if (existing.empty) {
          writes.push(notificationsRef.add({
            text: message,
            type: "new_match",
            matchId,
            timestamp: FieldValue.serverTimestamp(),
            read: false
          }));
        }
        if (shouldSendEmail) {
          writes.push(sendEmail(email, "New Match", message));
          writes.push(userRef.update({ "notifications.notifiedMatchWhileInactive": true }));
        }
        await Promise.all(writes);
      }));
    }
  }
);

// New Message Trigger
exports.notifyOnNewMessage = onDocumentCreated(
  {
    document: "matches/{matchId}/messages/{messageId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const message = event.data.data();
    const matchId = event.params.matchId;
    console.log("🔔 [notifyOnNewMessage] Triggered for match", matchId);

    const matchSnap = await db.collection("matches").doc(matchId).get();
    const matchData = matchSnap.data();
    if (!matchData) return;

    const userIds = matchData.userIds || matchData.participants || [];
    const recipientId = userIds.find((id) => id !== message.senderId);
    if (!recipientId) return;

    // Fetch sender name
    let senderName = "Someone";
    const senderSnap = await db.collection("users").doc(message.senderId).get();
    const senderData = senderSnap.data();
    if (senderData?.displayName) senderName = senderData.displayName;

    const userSnap = await db.collection("users").doc(recipientId).get();
    const userData = userSnap.data();
    if (!userData || !userData.notifications) return;
    const lastActive = userData.lastActive?.toDate ? userData.lastActive.toDate() : null;
    const minutesSinceActive = lastActive ? (Date.now() - lastActive.getTime()) / 60000 : null;
    const consideredInactive = minutesSinceActive === null || minutesSinceActive > 5;

    // Email logic
    const email = userData.notifications.emailEnabled && userData.notifications.email;
    const notifiedWhileInactive = userData.notifications.notifiedWhileInactive || false;
    const shouldSendEmail = email && consideredInactive && !notifiedWhileInactive;

    // In-app notification (avoid duplicates)
    const existing = await db.collection("users").doc(recipientId).collection("notifications")
      .where("type", "==", "new_message").where("senderId", "==", message.senderId)
      .where("matchId", "==", matchId).where("read", "==", false).limit(1).get();
    if (existing.empty) {
      await db.collection("users").doc(recipientId).collection("notifications").add({
        text: `You have new messages from ${senderName}!`,
        type: "new_message",
        matchId,
        senderId: message.senderId,
        senderName,
        timestamp: FieldValue.serverTimestamp(),
        read: false
      });
      console.log("[notifyOnNewMessage] In-app notification created for", recipientId);
    }

    await Promise.all([
      shouldSendEmail ? sendEmail(email, "New Messages", "You have new messages on DateScape!") : null,
      shouldSendEmail ? userSnap.ref.update({ "notifications.notifiedWhileInactive": true }) : null,
    ].filter(Boolean));
    if (shouldSendEmail) {
      console.log("[notifyOnNewMessage] Email sent and flag updated for", recipientId);
    }
  }
);

// One-off migration: races* -> ethnicities*
exports.migrateRaceToEthnicity = onRequest({ cors: true, secrets: [MIGRATION_SECRET] }, async (req, res) => {
  try {
    const provided = req.query.key || req.get('x-migration-key');
    const expected = process.env.MIGRATION_SECRET;
    if (!expected || provided !== expected) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const users = await db.collection('users').get();
    let updated = 0;
    for (const docSnap of users.docs) {
      const data = docSnap.data() || {};
      const profile = data.profile || {};
      const updates = {};
      const deletes = {};

      const sourceEthnicities = profile.ethnicities || profile.races;
      if (sourceEthnicities && !profile.ethnicities) {
        updates['profile.ethnicities'] = sourceEthnicities;
        deletes['profile.races'] = FieldValue.delete();
      }
      const sourcePrefs = profile.ethnicityPreferences || profile.racePreferences;
      if (sourcePrefs && !profile.ethnicityPreferences) {
        updates['profile.ethnicityPreferences'] = sourcePrefs;
        deletes['profile.racePreferences'] = FieldValue.delete();
      }
      const strength = profile.ethnicityPrefStrength || profile.racePrefStrength;
      if (typeof strength !== 'undefined' && typeof profile.ethnicityPrefStrength === 'undefined') {
        updates['profile.ethnicityPrefStrength'] = strength;
        deletes['profile.racePrefStrength'] = FieldValue.delete();
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
      }
    }
    return res.json({ ok: true, updated, total: users.size });
  } catch (e) {
    console.error('Migration failed', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});
