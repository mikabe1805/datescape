const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firebaseConfig = require("../../firebase.json");

describe("source-controlled Firestore authority rules", () => {
  it("is wired into the Firebase deployment manifest", () => {
    expect(firebaseConfig.firestore).toEqual(
      expect.objectContaining({ rules: "firestore.rules" }),
    );
  });

  it.each([
    "worldPlayers",
    "worldEventStates",
    "worldExpeditionStates",
    "worldExpeditionMemberships",
    "worldDiscoveryRefreshStates",
    "worldSharedEncounters",
    "worldResonanceEchoStates",
    "accountDeletionTombstones",
    "deletingAccounts",
    "reports",
    "safetyReportRateLimits",
  ])("denies direct client access to %s", (collectionName) => {
    const escaped = collectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(rules).toMatch(
      new RegExp(
        `match \\/${escaped}\\/\\{[^}]+\\} \\{[\\s\\S]*?allow read, write: if false;`,
      ),
    );
  });

  it("defaults every unlisted collection to deny", () => {
    expect(rules).toMatch(
      /match \/\{document=\*\*\} \{\s*allow read, write: if false;/,
    );
  });

  it("preserves active-owner access to notification documents", () => {
    expect(rules).toMatch(
      /match \/notifications\/\{notificationId\} \{\s*allow read, update, delete: if isActiveOwner\(uid\);\s*allow create: if false;/,
    );
  });

  it("allows legacy owner updates without trusting a mismatched uid field", () => {
    expect(rules).toContain("allow update: if isActiveOwner(uid)");
    expect(rules).toContain("!('uid' in request.resource.data)");
    expect(rules).toContain(
      "request.resource.data.uid == request.auth.uid",
    );
  });

  it("routes block mutations through trusted server code", () => {
    expect(rules).toContain(
      "request.resource.data.diff(resource.data).affectedKeys().hasAny([",
    );
    expect(rules).toContain("'blockedUsers', 'blockedAt'");
  });

  it("keeps private user documents owner-readable only", () => {
    expect(rules).toMatch(
      /match \/users\/\{uid\} \{\s*allow read: if isActiveOwner\(uid\);/,
    );
    expect(rules).not.toContain("allow read: if signedIn();");
  });

  it("fails profile and notification access closed after deletion starts", () => {
    expect(rules).toContain("function accountDeletionStarted(uid)");
    expect(rules).toContain(
      "/databases/$(database)/documents/deletingAccounts/$(uid)",
    );
    expect(rules).toContain(
      "return isOwner(uid) && !accountDeletionStarted(uid);",
    );
    expect(rules).toMatch(
      /match \/deletingAccounts\/\{uid\} \{\s*allow read, write: if false;/,
    );
  });

  it("denies match and chat access when either participant is deleting", () => {
    expect(rules).toContain("function matchAccountsAreActive(data)");
    expect(rules).toContain("function hasCanonicalMatchPair(data)");
    expect(rules).toContain("function hasLegacyMatchPair(data)");
    expect(rules).toContain("data.userA is string");
    expect(rules).toContain("data.userB is string");
    expect(rules).toContain("!accountDeletionStarted(data.userA)");
    expect(rules).toContain("!accountDeletionStarted(data.userB)");
    expect(rules).toContain(
      "!accountDeletionStarted(data.participants[0])",
    );
    expect(rules).toContain(
      "!accountDeletionStarted(data.participants[1])",
    );
    expect(rules).toContain("!accountDeletionStarted(request.auth.uid)");
    expect(rules).toContain("matchAccountsAreActive(data)");
  });

  it("keeps ended history readable while active chat writes require a mutual match", () => {
    expect(rules).toContain("match /messages/{messageId}");
    expect(rules).toContain(
      "Participants retain read-only access to ended conversation history.",
    );
    expect(rules).toContain("function isActiveMatchParticipant(matchId)");
    expect(rules).toContain("allow update: if isActiveMatchParticipant(matchId)");
    expect(rules).toContain("match /typingStatus/{uid}");
    expect(rules).toContain(
      "allow create, update: if validTypingState(uid) &&",
    );
    expect(rules).toContain("allow delete: if isActiveOwner(uid)");
  });

  it("reserves the complete match lifecycle for trusted code", () => {
    expect(rules).toMatch(
      /match \/matches\/\{matchId\} \{\s*allow read:[\s\S]*?allow create: if false;/,
    );
    expect(rules).toContain("allow update: if false;");
    expect(rules).toContain("allow delete: if false;");
  });

  it("does not expose legacy client-side consent transitions", () => {
    expect(rules).not.toContain("function validOwnMatchDecision(before, after)");
    expect(rules).not.toContain("function validMutualMatchDecision(before, after)");
    expect(rules).not.toContain("function validUnmatchDecision(before, after)");
  });

  it("binds new chat content to the authenticated sender and a mutual match", () => {
    expect(rules).toContain("function validNewMessage(matchId)");
    expect(rules).toContain("return isActiveMatchParticipant(matchId)");
    expect(rules).toContain("matchData.matched == true");
    expect(rules).toContain("request.resource.data.senderId == request.auth.uid");
    expect(rules).toContain("request.resource.data.timestamp == request.time");
    expect(rules).toContain(
      "request.resource.data.type in ['text', 'image', 'video', 'audio']",
    );
    expect(rules).not.toContain(
      "request.resource.data.type in ['text', 'image', 'video', 'audio', 'file']",
    );
  });

  it("limits read receipts to the recipient's false-to-true transition", () => {
    expect(rules).toContain("function validReadReceiptUpdate(before, after)");
    expect(rules).toContain("before.senderId != request.auth.uid");
    expect(rules).toContain("before.isRead == false");
    expect(rules).toContain("after.isRead == true");
    expect(rules).toContain("affectedKeys().hasOnly(['isRead'])");
  });

  it("limits reactions to the caller's own true-or-null map entry", () => {
    expect(rules).toContain("function validMessageLikeUpdate(before, after)");
    expect(rules).toContain("after.messageLikes is map");
    expect(rules).toContain(
      "after.messageLikes.get(request.auth.uid, null) in [true, null]",
    );
    expect(rules).toContain(".hasOnly([request.auth.uid])");
    expect(rules).toContain(".hasAny([request.auth.uid])");
    expect(rules).toContain("affectedKeys().hasOnly(['messageLikes'])");
  });

  it("constrains typing documents to the owner and one boolean field", () => {
    expect(rules).toContain("function validTypingState(uid)");
    expect(rules).toContain("request.resource.data.keys().hasOnly(['typing'])");
    expect(rules).toContain("request.resource.data.keys().hasAll(['typing'])");
    expect(rules).toContain("request.resource.data.typing is bool");
  });

  it("routes immutable safety reports and rate counters through trusted code", () => {
    expect(rules).toMatch(
      /match \/reports\/\{reportId\} \{\s*allow read, write: if false;/,
    );
    expect(rules).toMatch(
      /match \/safetyReportRateLimits\/\{uid\} \{\s*allow read, write: if false;/,
    );
    expect(rules).not.toContain("function validNewReport()");
  });

  it.each([
    "match /users/{uid}",
    "match /notifications/{notificationId}",
    "match /matches/{matchId}",
    "match /messages/{messageId}",
    "match /typingStatus/{uid}",
    "match /reports/{reportId}",
  ])("contains an explicit rule for the audited client path %s", (pathRule) => {
    expect(rules).toContain(pathRule);
  });
});
