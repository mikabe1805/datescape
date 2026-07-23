import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import {
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  set,
} from "firebase/database";
import { usePresence } from "./usePresence";
import { AVATAR_APPEARANCE_VERSION } from "./avatarAppearance";

jest.mock("../firebase", () => ({
  rtdb: {},
  auth: { currentUser: { uid: "local-player" } },
}));

jest.mock("firebase/database", () => ({
  ref: jest.fn((_database, path) => path),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
  runTransaction: jest.fn(() => Promise.resolve({ committed: true })),
  set: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 1234),
}));

const ROOM = "afterlight-market-garden-v1";
const REMOTE_SESSION = "remote_session_1234567890abcdef";
const appearance = {
  v: AVATAR_APPEARANCE_VERSION,
  frame: "balanced",
  skinTone: "warm-ochre",
  hairStyle: "asymmetric-bob",
  hairColor: "blue-black",
  outfit: {
    base: "promenade-v1",
    palette: "pearl-tide",
    trim: "accent",
  },
  accessory: "aged-bronze-fittings",
};
const profile = {
  name: "Ari",
  color: "#f5c973",
  intent: "friends",
  appearance,
  xp: 999,
  inventory: ["private"],
};
const originalCrypto = window.crypto;

function PresenceHarness({ value = profile }) {
  const snapshotRef = useRef({ x: 1, z: 2, heading: 0, speed: 0 });
  const extrasRef = useRef({});
  usePresence({
    snapshotRef,
    extrasRef,
    profile: value,
    enabled: true,
    currentRoom: ROOM,
  });
  return null;
}

function defaultValueListener(reference, callback) {
  if (reference === ".info/connected") {
    callback({ val: () => true });
  } else if (reference === `worldPresenceViews/local-player/${ROOM}`) {
    callback({ val: () => ({}) });
  }
  return jest.fn();
}

describe("usePresence session-bound projection", () => {
  beforeEach(() => {
    let sessionNonce = 1;
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: {
        getRandomValues: jest.fn((bytes) => {
          bytes.forEach((_, index) => {
            bytes[index] = (index + sessionNonce) % 256;
          });
          sessionNonce += 29;
          return bytes;
        }),
      },
    });
    jest.clearAllMocks();
    ref.mockImplementation((_database, path) => path);
    serverTimestamp.mockReturnValue(1234);
    onValue.mockImplementation(defaultValueListener);
    onDisconnect.mockImplementation(() => ({
      set: jest.fn(() => Promise.resolve()),
      cancel: jest.fn(() => Promise.resolve()),
    }));
    set.mockResolvedValue(undefined);
    runTransaction.mockResolvedValue({ committed: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("arms a session disconnect before ordered membership and presence publish", async () => {
    const view = render(<PresenceHarness />);

    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        `worldRoomMemberships/${ROOM}/local-player`,
        expect.objectContaining({
          sessionId: expect.stringMatching(/^[a-f0-9]{48}$/),
          joinedAt: 1234,
        }),
      ),
    );
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        `presence/${ROOM}/local-player`,
        expect.objectContaining({
          sessionId: expect.stringMatching(/^[a-f0-9]{48}$/),
          name: "Ari",
          appearance,
        }),
      ),
    );

    const membershipCall = set.mock.calls.find(([path]) =>
      path.startsWith("worldRoomMemberships/"),
    );
    const presenceCall = set.mock.calls.find(([path]) =>
      path.startsWith("presence/"),
    );
    expect(presenceCall[1].sessionId).toBe(membershipCall[1].sessionId);
    expect(set.mock.calls.indexOf(membershipCall)).toBeLessThan(
      set.mock.calls.indexOf(presenceCall),
    );
    expect(onDisconnect).toHaveBeenCalledWith(
      `worldRoomDisconnects/${ROOM}/local-player/${membershipCall[1].sessionId}`,
    );
    expect(onDisconnect.mock.results[0].value.set).toHaveBeenCalledWith(true);
    expect(JSON.stringify(presenceCall[1])).not.toMatch(/inventory|xp/);

    set.mockClear();
    view.rerender(
      <PresenceHarness
        value={{
          ...profile,
          appearance: { ...appearance, hairColor: "copper" },
        }}
      />,
    );
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        `presence/${ROOM}/local-player`,
        expect.objectContaining({
          sessionId: membershipCall[1].sessionId,
          appearance: expect.objectContaining({ hairColor: "copper" }),
        }),
      ),
    );

    view.unmount();
    expect(runTransaction).toHaveBeenCalledWith(
      `presence/${ROOM}/local-player`,
      expect.any(Function),
      { applyLocally: false },
    );
  });

  it("fails closed when the owner-only roster cannot load", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    onValue.mockImplementation((reference, callback, errorCallback) => {
      if (reference === ".info/connected") {
        callback({ val: () => true });
      } else if (reference === `worldPresenceViews/local-player/${ROOM}`) {
        errorCallback(new Error("permission denied"));
      }
      return jest.fn();
    });
    const snapshotRef = {
      current: { x: 1, z: 2, heading: 0, speed: 0 },
    };
    const extrasRef = { current: {} };
    const { result } = renderHook(() =>
      usePresence({
        snapshotRef,
        extrasRef,
        profile,
        currentRoom: ROOM,
      }),
    );

    await waitFor(() =>
      expect(onValue).toHaveBeenCalledWith(
        `worldPresenceViews/local-player/${ROOM}`,
        expect.any(Function),
        expect.any(Function),
      ),
    );
    expect(result.current.remotePlayers).toEqual([]);
    expect(onValue).not.toHaveBeenCalledWith(
      `presence/${ROOM}`,
      expect.any(Function),
      expect.any(Function),
    );
    expect(warn).toHaveBeenCalledWith(
      "[presence] roster subscribe failed:",
      "permission denied",
    );
  });

  it("subscribes only projected leaves and tears them down with the roster", async () => {
    let rosterCallback;
    const leafUnsubscribe = jest.fn();
    onValue.mockImplementation((reference, callback) => {
      if (reference === ".info/connected") {
        callback({ val: () => true });
      } else if (reference === `worldPresenceViews/local-player/${ROOM}`) {
        rosterCallback = callback;
        callback({ val: () => ({ "remote-player": REMOTE_SESSION }) });
      } else if (reference === `presence/${ROOM}/remote-player`) {
        callback({
          val: () => ({
            sessionId: REMOTE_SESSION,
            name: "Noor",
            color: "#f5c973",
            intent: "meet",
            appearance,
            x: 4,
            z: 5,
            heading: 1,
            speed: 0,
            lastUpdate: Date.now(),
          }),
        });
        return leafUnsubscribe;
      }
      return jest.fn();
    });
    const snapshotRef = {
      current: { x: 1, z: 2, heading: 0, speed: 0 },
    };
    const extrasRef = { current: {} };
    const { result } = renderHook(() =>
      usePresence({
        snapshotRef,
        extrasRef,
        profile,
        currentRoom: ROOM,
      }),
    );

    await waitFor(() =>
      expect(result.current.remotePlayers).toEqual([
        expect.objectContaining({ uid: "remote-player", name: "Noor" }),
      ]),
    );
    expect(onValue).not.toHaveBeenCalledWith(
      `presence/${ROOM}`,
      expect.any(Function),
      expect.any(Function),
    );

    act(() => rosterCallback({ val: () => ({}) }));
    expect(leafUnsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current.remotePlayers).toEqual([]);
  });

  it("rotates its session after a database reconnect", async () => {
    let connectedCallback;
    onValue.mockImplementation((reference, callback) => {
      if (reference === ".info/connected") {
        connectedCallback = callback;
        callback({ val: () => true });
      } else if (reference === `worldPresenceViews/local-player/${ROOM}`) {
        callback({ val: () => ({}) });
      }
      return jest.fn();
    });
    const view = render(<PresenceHarness />);
    await waitFor(() =>
      expect(
        set.mock.calls.filter(([path]) =>
          path.startsWith("worldRoomMemberships/"),
        ),
      ).toHaveLength(1),
    );
    const firstSession = set.mock.calls.find(([path]) =>
      path.startsWith("worldRoomMemberships/"),
    )[1].sessionId;

    act(() => connectedCallback({ val: () => false }));
    act(() => connectedCallback({ val: () => true }));
    await waitFor(() =>
      expect(
        set.mock.calls.filter(([path]) =>
          path.startsWith("worldRoomMemberships/"),
        ),
      ).toHaveLength(2),
    );
    const membershipCalls = set.mock.calls.filter(([path]) =>
      path.startsWith("worldRoomMemberships/"),
    );
    expect(membershipCalls[1][1].sessionId).not.toBe(firstSession);
    expect(onDisconnect).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
