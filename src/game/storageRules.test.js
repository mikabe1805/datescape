const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const rules = fs.readFileSync(path.join(root, "storage.rules"), "utf8");
const userMediaRules = rules.slice(
  rules.indexOf("match /userMedia"),
  rules.indexOf("// New chat media paths"),
);
const chatMediaRules = rules.slice(
  rules.indexOf("match /chatMedia"),
  rules.indexOf("// Default deny everything else."),
);
const firebaseConfig = require("../../firebase.json");

describe("source-controlled Storage authority rules", () => {
  it("is wired into the Firebase deployment manifest", () => {
    expect(firebaseConfig.storage).toEqual({ rules: "storage.rules" });
  });

  it("allows authenticated profile-media gets without directory listing", () => {
    expect(rules).toMatch(
      /match \/userMedia\/\{uid\}\/\{allPaths=\*\*\} \{[\s\S]*?allow get: if request\.auth != null;[\s\S]*?allow list: if false;/,
    );
    expect(rules).not.toContain("allow read: if request.auth != null;");
  });

  it("documents the durable legacy download-token limitation", () => {
    expect(rules).toContain("durable bearer-token URLs");
    expect(rules).toContain("not retroactive URL");
    expect(rules).toContain("token is rotated");
  });

  it("keeps ended chat media participant-readable but gates new uploads", () => {
    expect(rules).toContain("allow get: if isMatchParticipant(matchId);");
    expect(rules).toContain("allow list: if false;");
    expect(rules).toContain("function isActiveMatchParticipant(matchId)");
    expect(rules).toContain("matchData.matched == true");
    expect(rules).toContain(
      "&& isActiveMatchParticipant(matchId)",
    );
    expect(rules).toContain("allow update: if false;");
  });

  it("binds new media to its owner and permits deletion only before send", () => {
    expect(rules).toContain(
      "match /chatMedia/{matchId}/{ownerUid}/{messageId}/{fileName}",
    );
    expect(rules).toContain("request.auth.uid == ownerUid");
    expect(rules).toContain("allow delete: if request.auth != null");
    expect(rules).toContain(
      "/matches/$(matchId)/messages/$(messageId)",
    );
  });

  it("denies post-marker uploads without blocking owner orphan cleanup", () => {
    expect(rules).toContain("function accountDeletionStarted(uid)");
    expect(rules).toContain(
      "/databases/(default)/documents/deletingAccounts/$(uid)",
    );
    expect(userMediaRules).toContain("!accountDeletionStarted(uid)");
    expect(rules).toContain("!accountDeletionStarted(request.auth.uid)");
    expect(rules).toContain("!accountDeletionStarted(matchData.userA)");
    expect(rules).toContain("!accountDeletionStarted(matchData.userB)");
    expect(chatMediaRules).toContain(
      "&& !firestore.exists(\n                      /databases/(default)/documents/matches/$(matchId)/messages/$(messageId)",
    );
  });

  it("bounds chat media to explicit image, video, and audio formats", () => {
    expect(rules).toContain("request.resource.size > 0");
    expect(rules).toContain("request.resource.size <= 15 * 1024 * 1024");
    expect(rules).toContain("request.resource.size <= 50 * 1024 * 1024");
    expect(rules).toContain("request.resource.size <= 10 * 1024 * 1024");
    expect(rules).toContain('"image/(jpeg|png|webp|gif)"');
    expect(rules).toContain('"video/(mp4|webm|quicktime)"');
    expect(rules).toContain('"audio/(webm|ogg|mpeg|mp4|wav|x-m4a)"');
    expect(chatMediaRules).not.toContain('contentType.matches("image/.*")');
  });

  it("defaults every unlisted object path to deny", () => {
    expect(rules).toMatch(
      /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/,
    );
  });
});
