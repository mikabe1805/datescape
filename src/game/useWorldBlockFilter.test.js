import { act, renderHook } from "@testing-library/react";
import { onValue, ref } from "firebase/database";
import {
  projectedBlockedUids,
  useWorldBlockFilter,
} from "./useWorldBlockFilter";

let blockListener;
let blockErrorListener;

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  rtdb: {},
}));

jest.mock("firebase/database", () => ({
  ref: jest.fn((_database, path) => path),
  onValue: jest.fn((_reference, listener, errorListener) => {
    blockListener = listener;
    blockErrorListener = errorListener;
    listener({ val: () => null });
    return jest.fn();
  }),
}));

describe("live reciprocal block filter", () => {
  beforeEach(() => {
    blockListener = null;
    blockErrorListener = null;
    jest.clearAllMocks();
    ref.mockImplementation((_database, path) => path);
    onValue.mockImplementation((_reference, listener, errorListener) => {
      blockListener = listener;
      blockErrorListener = errorListener;
      listener({ val: () => null });
      return jest.fn();
    });
  });

  it("accepts only true server projection entries", () => {
    expect(
      projectedBlockedUids({
        "traveler-c": false,
        "traveler-b": true,
        "traveler-a": "true",
      }),
    ).toEqual(["traveler-b"]);
  });

  it("updates without a page refresh from the viewer-owned path", () => {
    const { result } = renderHook(() => useWorldBlockFilter());
    expect(ref).toHaveBeenCalledWith({}, "worldBlockFilters/traveler-a");

    act(() => {
      blockListener({ val: () => ({ "traveler-b": true }) });
    });

    expect(result.current).toEqual({
      blockedUids: ["traveler-b"],
      ready: true,
      error: null,
    });
  });

  it("stays explicitly unready and fail-closed when its private read fails", () => {
    onValue.mockImplementation((_reference, listener, errorListener) => {
      blockListener = listener;
      blockErrorListener = errorListener;
      return jest.fn();
    });
    const { result } = renderHook(() => useWorldBlockFilter());
    expect(result.current.ready).toBe(false);

    act(() => {
      blockErrorListener(new Error("permission denied"));
    });

    expect(result.current).toEqual({
      blockedUids: [],
      ready: false,
      error: "permission denied",
    });
  });
});
