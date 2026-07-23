const databaseRules = require("../../database.rules.json");

describe("public world presence rules", () => {
  const presenceRoomRules = databaseRules.rules.presence.$room;
  const presenceRules = databaseRules.rules.presence.$room.$uid;
  const appearanceRules = presenceRules.appearance;

  it("requires the bounded public appearance contract and rejects extra fields", () => {
    expect(presenceRules[".validate"]).toContain(
      "'sessionId','x','z','heading','speed'",
    );
    expect(presenceRules.$other[".validate"]).toBe(false);
    expect(appearanceRules[".validate"]).toContain("newData.hasChildren");
    expect(appearanceRules.$other[".validate"]).toBe(false);
    expect(appearanceRules.outfit.$other[".validate"]).toBe(false);
  });

  it("allows only authored appearance catalog ids", () => {
    expect(appearanceRules.frame[".validate"]).toContain(
      "narrow|balanced|broad",
    );
    expect(appearanceRules.hairStyle[".validate"]).toContain(
      "asymmetric-bob",
    );
    expect(appearanceRules.outfit.palette[".validate"]).toContain(
      "pearl-tide|coral-dusk|garden-glass",
    );
    expect(appearanceRules.outfit.trim[".validate"]).toContain(
      "accent|minimal|sunthread|rainlight",
    );
    expect(appearanceRules.outfit.trim[".validate"]).toContain(
      "worldCosmeticEntitlements",
    );
    expect(appearanceRules.outfit.trim[".validate"]).toContain(
      "child('rainlight')",
    );
    expect(appearanceRules.accessory[".validate"]).toContain(
      "aged-bronze-fittings|none",
    );
    expect(appearanceRules.accessory[".validate"]).toContain(
      "lanternkeeper-charm",
    );
    expect(appearanceRules.accessory[".validate"]).toContain(
      "worldCosmeticEntitlements",
    );
    expect(appearanceRules.accessory[".validate"]).toContain(
      "child('lanternkeeper')",
    );
  });

  it("denies room-parent reads and grants only a fresh session-matched leaf", () => {
    expect(presenceRoomRules[".read"]).toBe(false);
    expect(presenceRules[".read"]).toContain(
      "$room === 'afterlight-market-garden-v1'",
    );
    expect(presenceRules[".read"]).toContain("worldPresenceViews");
    expect(presenceRules[".read"]).toContain("worldRoomMemberships");
    expect(presenceRules[".read"]).toContain("worldBlockEdges");
    expect(presenceRules[".read"]).toContain("now - 15000");
    expect(presenceRules[".write"]).toContain("worldRoomMemberships");
    expect(presenceRules[".write"]).toContain(
      "worldAccountDeletionTombstones",
    );
    expect(presenceRules[".validate"]).toContain(
      "newData.child('sessionId')",
    );
  });

  it("keeps membership, disconnect, and projected roster authority scoped", () => {
    const memberships = databaseRules.rules.worldRoomMemberships.$room;
    const disconnect =
      databaseRules.rules.worldRoomDisconnects.$room.$uid.$sessionId;
    const roster = databaseRules.rules.worldPresenceViews.$viewerUid.$room;
    expect(memberships[".read"]).toBe(false);
    expect(memberships.$uid[".write"]).toContain("auth.uid === $uid");
    expect(memberships.$uid[".write"]).toContain(
      "$room === 'afterlight-market-garden-v1'",
    );
    expect(memberships.$uid[".write"]).toContain(
      "worldAccountDeletionTombstones",
    );
    expect(disconnect[".write"]).toContain("auth.uid === $uid");
    expect(disconnect[".write"]).toContain(
      "worldAccountDeletionTombstones",
    );
    expect(databaseRules.rules.worldPresenceViews[".write"]).toBe(false);
    expect(roster[".read"]).toContain("auth.uid === $viewerUid");
    expect(databaseRules.rules.worldAccountDeletionTombstones).toEqual({
      ".read": false,
      ".write": false,
    });
  });
});

describe("Rainlight Relay public-state rules", () => {
  const publicRules =
    databaseRules.rules.worldEvents.$room.$eventId.public;
  const privateRules =
    databaseRules.rules.worldEvents.$room.$eventId.$other;

  it("allows authenticated aggregate reads and denies every client write", () => {
    expect(publicRules[".read"]).toBe("auth != null");
    expect(publicRules[".write"]).toBe(false);
    expect(privateRules[".read"]).toBe(false);
    expect(privateRules[".write"]).toBe(false);
  });
});

describe("Lanternkeeper Expedition public-state rules", () => {
  const expeditionRules =
    databaseRules.rules.worldExpeditions.$expeditionId;

  it("allows authenticated aggregate reads and denies all direct writes", () => {
    expect(expeditionRules.public[".read"]).toBe("auth != null");
    expect(expeditionRules.public[".write"]).toBe(false);
    expect(expeditionRules.public[".indexOn"]).toEqual(["startedAt"]);
  });

  it("keeps every non-public expedition path private", () => {
    expect(expeditionRules.$other[".read"]).toBe(false);
    expect(expeditionRules.$other[".write"]).toBe(false);
  });
});

describe("station seat session identity rules", () => {
  const stationsRules = databaseRules.rules.stations;
  const stationRules = databaseRules.rules.stations.$room.$stationId;
  const seatsRules = stationRules.seats;
  const seatWrite = seatsRules.$uid[".write"];
  const seatValidation = stationRules.seats.$uid[".validate"];
  const matchRules = stationRules.match;

  it("keeps the station parent private and exposes only a two-seat roster", () => {
    expect(stationsRules.$room[".read"]).toBeUndefined();
    expect(seatsRules[".read"]).toContain("auth != null");
    expect(seatsRules[".read"]).toContain(
      "query.orderByChild === 'sitAt'",
    );
    expect(seatsRules[".read"]).toContain("query.limitToFirst <= 2");
    expect(seatsRules[".indexOn"]).toEqual(["sitAt"]);
    expect(seatsRules.$uid[".read"]).toBe(
      "auth != null && auth.uid === $uid",
    );
  });

  it("requires a bounded seat token and denies in-place rotation", () => {
    expect(seatValidation).toContain(
      "newData.hasChildren(['name','color','sitAt','sessionId'])",
    );
    expect(seatValidation).toContain("matches(/^[a-f0-9]{32}$/)");
    expect(seatValidation).toContain(
      "newData.child('sessionId').val() === data.child('sessionId').val()",
    );
    expect(seatValidation).toContain("newData.child('sitAt').val() >= now - 5000");
    expect(seatValidation).toContain(
      "newData.child('sitAt').val() === data.child('sitAt').val()",
    );
    expect(seatsRules.$uid.$other[".validate"]).toBe(false);
  });

  it("does not let an outsider replace a departed seat during a live match", () => {
    expect(seatWrite).toContain("child('match').exists()");
    expect(seatWrite).toContain("child('white').val() === $uid");
    expect(seatWrite).toContain("child('black').val() === $uid");
    expect(seatWrite).toContain(
      "child('whiteSeatSessionId').val() === newData.child('sessionId').val()",
    );
    expect(seatWrite).toContain(
      "child('blackSeatSessionId').val() === newData.child('sessionId').val()",
    );
  });

  it("grants private match reads only to the exact seated incarnation", () => {
    const readRule = matchRules[".read"];

    expect(readRule).toContain("child('seats').child(auth.uid).exists()");
    expect(readRule).toContain("data.child('white').val() === auth.uid");
    expect(readRule).toContain("data.child('black').val() === auth.uid");
    expect(readRule).toContain(
      "child(auth.uid).child('sessionId').val() === data.child('whiteSeatSessionId').val()",
    );
    expect(readRule).toContain(
      "child(auth.uid).child('sessionId').val() === data.child('blackSeatSessionId').val()",
    );
    expect(readRule).toContain("root.child('worldBlockEdges')");
  });

  it("binds match tokens to current seats at creation", () => {
    const writeRule = matchRules[".write"];

    expect(writeRule).toContain(
      "newData.child('whiteSeatSessionId').val() === root.child('stations')",
    );
    expect(writeRule).toContain(
      "newData.child('blackSeatSessionId').val() === root.child('stations')",
    );
    expect(matchRules.whiteSeatSessionId[".validate"]).toContain(
      "matches(/^[a-f0-9]{32}$/)",
    );
    expect(matchRules.blackSeatSessionId[".validate"]).toContain(
      "matches(/^[a-f0-9]{32}$/)",
    );
    expect(matchRules[".validate"]).toContain(
      "'whiteSeatSessionId','blackSeatSessionId'",
    );
  });

  it("allows participant teardown but no client update to an existing match", () => {
    const writeRule = matchRules[".write"];

    expect(writeRule).toContain("data.exists() && !newData.exists()");
    expect(writeRule).toContain("data.child('white').val() === auth.uid");
    expect(writeRule).toContain("data.child('black').val() === auth.uid");
    expect(writeRule).not.toContain("newData.child('fen').val()");
  });
});

describe("station completion acknowledgement rules", () => {
  const matchRules =
    databaseRules.rules.stations.$room.$stationId.match;
  const acknowledgementRules = matchRules.completionAcks.$uid;

  it("does not let the broad match grant bypass receipt ownership", () => {
    expect(matchRules[".write"]).toContain(
      "!newData.child('completionAcks').exists()",
    );
    expect(matchRules[".write"]).toContain("!newData.exists()");
    expect(matchRules[".write"]).toContain(
      "!newData.child('socialChoices').exists()",
    );
    expect(matchRules[".write"]).toContain(
      "data.exists() && !newData.exists()",
    );
  });

  it("grants only a seated participant's first write to their uid key", () => {
    const writeRule = acknowledgementRules[".write"];

    expect(writeRule).toContain("auth.uid === $uid");
    expect(writeRule).toContain("!data.exists() && newData.exists()");
    expect(writeRule).toContain("child('seats').child($uid).exists()");
    expect(writeRule).toContain(
      "$uid === newData.parent().parent().child('white').val()",
    );
    expect(writeRule).toContain(
      "$uid === newData.parent().parent().child('black').val()",
    );
    expect(writeRule).toContain(
      "newData.child('matchId').val() === newData.parent().parent().child('id').val()",
    );
    expect(writeRule).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().child('whiteSeatSessionId').val()",
    );
    expect(writeRule).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().child('blackSeatSessionId').val()",
    );
  });

  it("accepts exactly a current match id and near-server timestamp", () => {
    const validateRule = acknowledgementRules[".validate"];

    expect(validateRule).toContain(
      "newData.hasChildren(['matchId','acknowledgedAt'])",
    );
    expect(validateRule).toContain("acknowledgedAt').val() >= now - 5000");
    expect(validateRule).toContain("acknowledgedAt').val() <= now + 5000");
    expect(validateRule).not.toMatch(/name|color|profile|partner/i);
    expect(acknowledgementRules.$other[".validate"]).toBe(false);
  });
});

describe("station chess payload bounds", () => {
  const matchRules = databaseRules.rules.stations.$room.$stationId.match;
  const moveRules = matchRules.moves;
  const moveWrite = moveRules.$moveKey[".write"];
  const moveValidation = moveRules.$moveKey[".validate"];

  it("starts from the authored board and caps retained history", () => {
    const matchValidation = matchRules[".validate"];

    expect(matchValidation).toContain(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(matchValidation).toContain("!newData.child('moves').exists()");
    expect(moveRules[".validate"]).toContain("child('mode').val() === 'chess'");
  });

  it("denies all direct client chess-state mutations", () => {
    expect(moveRules[".write"]).toBe(false);
    expect(moveWrite).toBe(false);
    expect(matchRules.fen[".write"]).toBe(false);
    expect(matchRules.lastMoveAt[".write"]).toBe(false);
    expect(matchRules.result[".write"]).toBe(false);
    expect(matchRules.endedAt[".write"]).toBe(false);
  });

  it("validates the bounded server move shape", () => {
    expect(moveValidation).toContain(
      "newData.hasChildren(['actionId','san','by','at','ply'])",
    );
    expect(moveValidation).toContain("child('actionId').val().matches");
    expect(moveValidation).toContain("child('san').val().length <= 24");
    expect(moveValidation).toContain("child('ply').val() <= 512");
    expect(matchRules.result[".validate"]).toContain(
      "matches(/^(white|black|draw)$/)",
    );
    expect(moveRules.$moveKey.$other[".validate"]).toBe(false);
  });
});

describe("Listening Crescent social choice rules", () => {
  const matchRules = databaseRules.rules.stations.$room.$stationId.match;
  const choiceRules = matchRules.socialChoices.$uid;

  it("keeps child writes participant-owned, seated, social, and immutable", () => {
    const writeRule = choiceRules[".write"];

    expect(writeRule).toContain("auth.uid === $uid");
    expect(writeRule).toContain("!data.exists() && newData.exists()");
    expect(writeRule).toContain("$stationId === 'listening-crescent'");
    expect(writeRule).toContain("child('seats').child($uid).exists()");
    expect(writeRule).toContain("child('mode').val() === 'social'");
    expect(writeRule).toContain(
      "$uid === newData.parent().parent().child('white').val()",
    );
    expect(writeRule).toContain(
      "$uid === newData.parent().parent().child('black').val()",
    );
    expect(writeRule).toContain(
      "newData.child('matchId').val() === newData.parent().parent().child('id').val()",
    );
    expect(writeRule).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().child('whiteSeatSessionId').val()",
    );
    expect(writeRule).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().child('blackSeatSessionId').val()",
    );
  });

  it("accepts only the current match, an allowed choice, and a near-server timestamp", () => {
    const validateRule = choiceRules[".validate"];

    expect(validateRule).toContain(
      "newData.hasChildren(['matchId','choiceId','chosenAt'])",
    );
    expect(validateRule).toContain("matches(/^(a|b|c|pass)$/)");
    expect(validateRule).toContain("chosenAt').val() >= now - 5000");
    expect(validateRule).toContain("chosenAt').val() <= now + 5000");
    expect(validateRule).not.toMatch(/name|color|profile|partner/i);
    expect(choiceRules.$other[".validate"]).toBe(false);
  });

  it("keeps the match-owned card id fixed to the authored catalog", () => {
    const validateRule = matchRules.socialCardId[".validate"];

    expect(validateRule).toContain("child('mode').val() === 'social'");
    expect(validateRule).toContain(
      "matches(/^(open-evening|easy-conversation|small-care|tiny-adventure|after-a-long-week|slow-curiosity)$/)",
    );
    expect(validateRule).toContain(
      "!data.exists() || newData.val() === data.val()",
    );
  });
});

describe("Resonance note seat-session rules", () => {
  const noteRules =
    databaseRules.rules.stations.$room.$stationId.match.notes.$round.$uid;
  const noteValidation = noteRules[".validate"];

  it("binds each note to the participant's exact seated incarnation", () => {
    expect(noteValidation).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().parent().child('whiteSeatSessionId').val()",
    );
    expect(noteValidation).toContain(
      "child($uid).child('sessionId').val() === newData.parent().parent().parent().child('blackSeatSessionId').val()",
    );
    expect(noteRules[".write"]).toContain("!data.exists() && newData.exists()");
    expect(noteRules[".write"]).toContain("root.child('worldBlockEdges')");
  });
});

describe("reciprocal world block authority rules", () => {
  const blockEdges = databaseRules.rules.worldBlockEdges;
  const blockFilters = databaseRules.rules.worldBlockFilters;
  const stationMatch =
    databaseRules.rules.stations.$room.$stationId.match;
  const signalWrite =
    databaseRules.rules.signals.$toUid.$signalKey[".write"];
  const signalValidation =
    databaseRules.rules.signals.$toUid.$signalKey[".validate"];
  const likeWrite =
    databaseRules.rules.worldLikesByRecipient.$toUid.$fromUid[".write"];

  it("keeps directional authority private and exposes only my directionless filter", () => {
    expect(blockEdges[".read"]).toBe(false);
    expect(blockEdges[".write"]).toBe(false);
    expect(blockFilters.$uid[".read"]).toBe(
      "auth != null && auth.uid === $uid",
    );
    expect(blockFilters.$uid[".write"]).toBe(false);
  });

  it("denies match creation and mutation when either participant blocked the other", () => {
    const writeRule = stationMatch[".write"];
    expect(writeRule).toContain("root.child('worldBlockEdges')");
    expect(writeRule).toContain(
      "child(newData.child('white').val()).child(newData.child('black').val())",
    );
    expect(writeRule).toContain(
      "child(newData.child('black').val()).child(newData.child('white').val())",
    );

    [
      stationMatch.socialChoices.$uid[".write"],
      stationMatch.completionAcks.$uid[".write"],
    ].forEach((receiptRule) => {
      expect(receiptRule).toContain("root.child('worldBlockEdges')");
      expect(receiptRule).toContain("child('white').val()");
      expect(receiptRule).toContain("child('black').val()");
    });
  });

  it("denies new signals and likes in both block directions while preserving cleanup", () => {
    expect(databaseRules.rules.signals.$toUid[".indexOn"]).toEqual(["at"]);
    expect(signalWrite).toContain("$signalKey === auth.uid");
    expect(signalWrite).toContain("newData.exists()");
    expect(signalWrite).toContain("child(auth.uid).child($toUid)");
    expect(signalWrite).toContain("child($toUid).child(auth.uid)");
    expect(signalWrite).toContain("!newData.exists() && auth.uid === $toUid");
    expect(signalValidation).toContain(
      "newData.hasChildren(['type','fromUid','fromName','fromColor','at'])",
    );
    expect(signalValidation).toContain(
      "wave|like-mutual|invite-chess|invite-chess-accepted|invite-chess-declined",
    );
    expect(likeWrite).toContain("child($fromUid).child($toUid)");
    expect(likeWrite).toContain("child($toUid).child($fromUid)");
    expect(likeWrite).toContain("!newData.exists()");
  });
});
