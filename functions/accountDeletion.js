"use strict";

const { createHash } = require("node:crypto");

const ACCOUNT_DELETION_TOMBSTONE_COLLECTION = "accountDeletionTombstones";
const DELETING_ACCOUNT_COLLECTION = "deletingAccounts";

function accountDeletionTombstoneId(uid) {
  return createHash("sha256")
    .update(`account-deletion|${uid}`)
    .digest("hex");
}

function uniqueAccountUids(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((uid) => typeof uid === "string")
        .map((uid) => uid.trim())
        .filter(Boolean),
    ),
  ];
}

function deletionManifestMatchIds(value, discoveredMatchIds = []) {
  return [
    ...new Set([
      ...(Array.isArray(value?.matchIds) ? value.matchIds : []),
      ...(Array.isArray(discoveredMatchIds) ? discoveredMatchIds : []),
    ]
      .filter((matchId) => typeof matchId === "string")
      .map((matchId) => matchId.trim())
      .filter(Boolean)),
  ].sort();
}

function accountAdmissionIsActive(records) {
  return (
    Array.isArray(records) &&
    records.length > 0 &&
    records.every(
      (record) =>
        record?.userExists === true &&
        record?.hashedTombstoneExists !== true &&
        record?.rulesMarkerExists !== true,
    )
  );
}

module.exports = {
  ACCOUNT_DELETION_TOMBSTONE_COLLECTION,
  DELETING_ACCOUNT_COLLECTION,
  accountAdmissionIsActive,
  accountDeletionTombstoneId,
  deletionManifestMatchIds,
  uniqueAccountUids,
};
