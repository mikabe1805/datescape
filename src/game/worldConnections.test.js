import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  WORLD_CONNECTION_LIMIT,
  connectionMapFromSnapshot,
  subscribeToWorldConnections,
} from "./worldConnections";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

describe("world connection roster", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    collection.mockReturnValue({ path: "matches" });
    where.mockImplementation((field, operator, value) => ({
      field,
      operator,
      value,
    }));
    orderBy.mockImplementation((field, direction) => ({ field, direction }));
    limit.mockImplementation((value) => ({ value }));
    query.mockImplementation((source, ...constraints) => ({
      source,
      constraints,
    }));
    onSnapshot.mockReturnValue(jest.fn());
  });

  it("subscribes to only the newest bounded mutual connections", () => {
    const onConnections = jest.fn();
    const unsubscribe = subscribeToWorldConnections({
      db: { name: "db" },
      uid: "traveler-a",
      onConnections,
    });

    expect(collection).toHaveBeenCalledWith({ name: "db" }, "matches");
    expect(where).toHaveBeenCalledWith(
      "participants",
      "array-contains",
      "traveler-a",
    );
    expect(where).toHaveBeenCalledWith("matched", "==", true);
    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledWith(WORLD_CONNECTION_LIMIT);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(typeof unsubscribe).toBe("function");
  });

  it("maps only verified mutual documents to their existing private chat", () => {
    const snapshot = {
      docs: [
        {
          id: "traveler-a_traveler-b",
          data: () => ({
            participants: ["traveler-a", "traveler-b"],
            matched: true,
          }),
        },
        {
          id: "not-mutual",
          data: () => ({
            participants: ["traveler-a", "traveler-c"],
            matched: false,
          }),
        },
        {
          id: "traveler-a_traveler-d",
          data: () => ({
            userA: "traveler-d",
            userB: "traveler-a",
            matched: true,
          }),
        },
      ],
    };

    expect(connectionMapFromSnapshot(snapshot, "traveler-a")).toEqual({
      "traveler-b": "traveler-a_traveler-b",
      "traveler-d": "traveler-a_traveler-d",
    });
  });

  it("delivers live snapshot changes and reports subscription failures", () => {
    let emitSnapshot;
    let emitError;
    onSnapshot.mockImplementation((_target, next, error) => {
      emitSnapshot = next;
      emitError = error;
      return jest.fn();
    });
    const onConnections = jest.fn();
    const onError = jest.fn();

    subscribeToWorldConnections({
      db: { name: "db" },
      uid: "traveler-a",
      onConnections,
      onError,
    });
    emitSnapshot({
      docs: [
        {
          id: "match-one",
          data: () => ({
            participants: ["traveler-a", "traveler-b"],
            matched: true,
          }),
        },
      ],
    });
    const failure = new Error("index unavailable");
    emitError(failure);

    expect(onConnections).toHaveBeenCalledWith({
      "traveler-b": "match-one",
    });
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
