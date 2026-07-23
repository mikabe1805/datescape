const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(root, "firebase.json"), "utf8"),
);
const indexConfig = JSON.parse(
  fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"),
);

function hasMatchIndex(expectedFields) {
  return indexConfig.indexes.some(
    (index) =>
      index.collectionGroup === "matches" &&
      index.queryScope === "COLLECTION" &&
      expectedFields.every((expected) =>
        index.fields.some(
          (field) =>
            field.fieldPath === expected.fieldPath &&
            field[expected.mode] === expected.value,
        ),
      ),
  );
}

function hasCollectionIndex(collectionGroup, expectedFields) {
  return indexConfig.indexes.some(
    (index) =>
      index.collectionGroup === collectionGroup &&
      index.queryScope === "COLLECTION" &&
      expectedFields.every((expected) =>
        index.fields.some(
          (field) =>
            field.fieldPath === expected.fieldPath &&
            field[expected.mode] === expected.value,
        ),
      ),
  );
}

describe("source-controlled Firestore indexes", () => {
  it("wires the index file into the Firebase deployment config", () => {
    expect(firebaseConfig.firestore).toEqual(
      expect.objectContaining({
        rules: "firestore.rules",
        indexes: "firestore.indexes.json",
      }),
    );
  });

  it("covers the mutual-connections participant query", () => {
    expect(
      hasMatchIndex([
        {
          fieldPath: "participants",
          mode: "arrayConfig",
          value: "CONTAINS",
        },
        { fieldPath: "matched", mode: "order", value: "ASCENDING" },
        { fieldPath: "timestamp", mode: "order", value: "DESCENDING" },
      ]),
    ).toBe(true);
  });

  it.each([
    ["userA", "isActiveA"],
    ["userB", "isActiveB"],
  ])("covers the %s discovery queue query", (userField, activeField) => {
    expect(
      hasMatchIndex([
        { fieldPath: userField, mode: "order", value: "ASCENDING" },
        { fieldPath: activeField, mode: "order", value: "ASCENDING" },
      ]),
    ).toBe(true);
  });

  it("covers the bounded incoming-unread preview query", () => {
    expect(
      hasCollectionIndex("messages", [
        { fieldPath: "senderId", mode: "order", value: "ASCENDING" },
        { fieldPath: "isRead", mode: "order", value: "ASCENDING" },
      ]),
    ).toBe(true);
  });
});
