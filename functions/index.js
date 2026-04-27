const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const sgMail = require("@sendgrid/mail");

initializeApp();
const db = getFirestore();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const MIGRATION_SECRET = defineSecret("MIGRATION_SECRET");

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

function getMatchParticipants(matchData = {}) {
  const participants = matchData.userIds || matchData.participants;
  if (Array.isArray(participants) && participants.length) {
    return participants.filter(Boolean);
  }

  return [matchData.userA, matchData.userB].filter(Boolean);
}

function buildPushPayload({ title, body, type, matchId, senderId = "", senderName = "" }) {
  return {
    data: {
      title,
      body,
      type,
      matchId: matchId || "",
      senderId,
      senderName,
      clickPath: matchId ? `/app/chat/${matchId}` : "/app/match-queue"
    },
    webpush: {
      headers: {
        Urgency: "high"
      }
    }
  };
}

async function sendPushToUser(userRef, userData, payload) {
  const tokens = [...new Set((userData?.notifications?.webPushTokens || []).filter(Boolean))];
  if (!tokens.length) return;

  const result = await getMessaging().sendEachForMulticast({
    tokens,
    ...payload
  });

  const invalidTokens = [];
  result.responses.forEach((response, index) => {
    if (response.success) return;

    const code = response.error?.code || "unknown";
    console.error("[Push] Delivery failure:", code);
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await userRef.update({
      "notifications.webPushTokens": FieldValue.arrayRemove(...invalidTokens)
    });
  }
}

exports.notifyOnMatchActivated = onDocumentUpdated(
  {
    document: "matches/{matchId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (before.matched || !after.matched) return;

    const matchId = event.params.matchId;
    const participants = getMatchParticipants(after);

    await Promise.all(
      participants.map(async (userId) => {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        if (!userData || !userData.notifications) return;

        const lastActive = userData.lastActive?.toDate ? userData.lastActive.toDate() : null;
        const minutesSinceActive = lastActive ? (Date.now() - lastActive.getTime()) / 60000 : null;
        const consideredInactive = minutesSinceActive === null || minutesSinceActive > 5;
        const isActive = userData.active === true;

        const email = userData.notifications.emailEnabled && userData.notifications.email;
        const notifiedMatchWhileInactive = userData.notifications.notifiedMatchWhileInactive || false;
        const shouldSendEmail = email && consideredInactive && !notifiedMatchWhileInactive;
        const notificationText = "You have a new match on DateScape!";

        const notificationsRef = userRef.collection("notifications");
        const existing = await notificationsRef
          .where("type", "==", "new_match")
          .where("matchId", "==", matchId)
          .where("read", "==", false)
          .limit(1)
          .get();

        const writes = [];
        if (existing.empty) {
          writes.push(
            notificationsRef.add({
              text: notificationText,
              type: "new_match",
              matchId,
              timestamp: FieldValue.serverTimestamp(),
              read: false
            })
          );
        }

        if (shouldSendEmail) {
          writes.push(sendEmail(email, "New Match", notificationText));
          writes.push(userRef.update({ "notifications.notifiedMatchWhileInactive": true }));
        }

        if (!isActive || consideredInactive) {
          writes.push(
            sendPushToUser(
              userRef,
              userData,
              buildPushPayload({
                title: "New Match",
                body: notificationText,
                type: "new_match",
                matchId
              })
            )
          );
        }

        await Promise.all(writes);
      })
    );
  }
);

exports.notifyOnNewMessage = onDocumentCreated(
  {
    document: "matches/{matchId}/messages/{messageId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const message = event.data.data();
    const matchId = event.params.matchId;
    console.log("[notifyOnNewMessage] Triggered for match", matchId);

    const matchSnap = await db.collection("matches").doc(matchId).get();
    const matchData = matchSnap.data();
    if (!matchData) return;

    const participants = getMatchParticipants(matchData);
    const recipientId = participants.find((id) => id !== message.senderId);
    if (!recipientId) return;

    let senderName = "Someone";
    const senderSnap = await db.collection("users").doc(message.senderId).get();
    const senderData = senderSnap.data();
    if (senderData?.displayName) {
      senderName = senderData.displayName;
    }

    const userSnap = await db.collection("users").doc(recipientId).get();
    const userData = userSnap.data();
    if (!userData || !userData.notifications) return;

    const lastActive = userData.lastActive?.toDate ? userData.lastActive.toDate() : null;
    const minutesSinceActive = lastActive ? (Date.now() - lastActive.getTime()) / 60000 : null;
    const consideredInactive = minutesSinceActive === null || minutesSinceActive > 5;
    const isActive = userData.active === true;

    const email = userData.notifications.emailEnabled && userData.notifications.email;
    const notifiedWhileInactive = userData.notifications.notifiedWhileInactive || false;
    const shouldSendEmail = email && consideredInactive && !notifiedWhileInactive;

    const notificationsRef = userSnap.ref.collection("notifications");
    const existing = await notificationsRef
      .where("type", "==", "new_message")
      .where("senderId", "==", message.senderId)
      .where("matchId", "==", matchId)
      .where("read", "==", false)
      .limit(1)
      .get();

    if (existing.empty) {
      await notificationsRef.add({
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

    await Promise.all(
      [
        !isActive || consideredInactive
          ? sendPushToUser(
              userSnap.ref,
              userData,
              buildPushPayload({
                title: senderName,
                body: message.text || "Sent you a new message.",
                type: "new_message",
                matchId,
                senderId: message.senderId,
                senderName
              })
            )
          : null,
        shouldSendEmail
          ? sendEmail(email, "New Messages", "You have new messages on DateScape!")
          : null,
        shouldSendEmail
          ? userSnap.ref.update({ "notifications.notifiedWhileInactive": true })
          : null
      ].filter(Boolean)
    );

    if (shouldSendEmail) {
      console.log("[notifyOnNewMessage] Email sent and flag updated for", recipientId);
    }
  }
);

exports.migrateRaceToEthnicity = onRequest(
  { cors: true, secrets: [MIGRATION_SECRET] },
  async (req, res) => {
    try {
      const provided = req.query.key || req.get("x-migration-key");
      const expected = process.env.MIGRATION_SECRET;
      if (!expected || provided !== expected) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      const users = await db.collection("users").get();
      let updated = 0;

      for (const docSnap of users.docs) {
        const data = docSnap.data() || {};
        const profile = data.profile || {};
        const updates = {};
        const deletes = {};

        const sourceEthnicities = profile.ethnicities || profile.races;
        if (sourceEthnicities && !profile.ethnicities) {
          updates["profile.ethnicities"] = sourceEthnicities;
          deletes["profile.races"] = FieldValue.delete();
        }
        const sourcePrefs = profile.ethnicityPreferences || profile.racePreferences;
        if (sourcePrefs && !profile.ethnicityPreferences) {
          updates["profile.ethnicityPreferences"] = sourcePrefs;
          deletes["profile.racePreferences"] = FieldValue.delete();
        }
        const strength = profile.ethnicityPrefStrength || profile.racePrefStrength;
        if (
          typeof strength !== "undefined" &&
          typeof profile.ethnicityPrefStrength === "undefined"
        ) {
          updates["profile.ethnicityPrefStrength"] = strength;
          deletes["profile.racePrefStrength"] = FieldValue.delete();
        }
        const hasPref =
          typeof profile.hasEthnicityPref !== "undefined"
            ? profile.hasEthnicityPref
            : profile.hasRacePref;
        if (
          typeof hasPref !== "undefined" &&
          typeof profile.hasEthnicityPref === "undefined"
        ) {
          updates["profile.hasEthnicityPref"] = hasPref;
          if (typeof profile.hasRacePref !== "undefined") {
            deletes["profile.hasRacePref"] = FieldValue.delete();
          }
        }
        const dealbreaker =
          typeof profile.ethnicityDealbreaker !== "undefined"
            ? profile.ethnicityDealbreaker
            : profile.raceDealbreaker;
        if (
          typeof dealbreaker !== "undefined" &&
          typeof profile.ethnicityDealbreaker === "undefined"
        ) {
          updates["profile.ethnicityDealbreaker"] = dealbreaker;
          if (typeof profile.raceDealbreaker !== "undefined") {
            deletes["profile.raceDealbreaker"] = FieldValue.delete();
          }
        }

        if (Object.keys(updates).length || Object.keys(deletes).length) {
          await docSnap.ref.update({
            ...updates,
            ...deletes,
            "profile._migratedEthnicity": true
          });
          updated += 1;
        }
      }

      return res.json({ ok: true, updated, total: users.size });
    } catch (error) {
      console.error("Migration failed", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  }
);
