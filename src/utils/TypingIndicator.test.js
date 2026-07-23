import { act, renderHook } from "@testing-library/react";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { useTypingStatus } from "./TypingIndicator";

jest.mock("../firebase", () => ({ db: { name: "db" } }));

jest.mock("firebase/firestore", () => ({
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_db, collectionPath, uid) => ({
    path: `${collectionPath}/${uid}`,
  })),
  onSnapshot: jest.fn(() => jest.fn()),
  setDoc: jest.fn(() => Promise.resolve()),
}));

describe("useTypingStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setDoc.mockResolvedValue(undefined);
    deleteDoc.mockResolvedValue(undefined);
    doc.mockImplementation((_db, collectionPath, uid) => ({
      path: `${collectionPath}/${uid}`,
    }));
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("writes only the exact boolean typing schema", () => {
    const { result, unmount } = renderHook(() =>
      useTypingStatus("traveler-a_traveler-b", "traveler-a"),
    );

    act(() => result.current());
    expect(setDoc).toHaveBeenNthCalledWith(
      1,
      { path: "matches/traveler-a_traveler-b/typingStatus/traveler-a" },
      { typing: true },
    );

    act(() => jest.advanceTimersByTime(2000));
    expect(setDoc).toHaveBeenNthCalledWith(
      2,
      { path: "matches/traveler-a_traveler-b/typingStatus/traveler-a" },
      { typing: false },
    );
    expect(setDoc.mock.calls.flat()).not.toContainEqual({ merge: true });
    unmount();
  });

  it("cancels pending writes and deletes stale state when a chat ends", () => {
    const { result, rerender } = renderHook(
      ({ matchId }) => useTypingStatus(matchId, "traveler-a"),
      { initialProps: { matchId: "traveler-a_traveler-b" } },
    );

    act(() => result.current());
    rerender({ matchId: null });
    act(() => jest.advanceTimersByTime(2000));

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledWith({
      path: "matches/traveler-a_traveler-b/typingStatus/traveler-a",
    });
    expect(doc).toHaveBeenCalledWith(
      { name: "db" },
      "matches/traveler-a_traveler-b/typingStatus",
      "traveler-a",
    );
  });
});
