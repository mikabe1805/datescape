import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MatchList, {
  CONNECTION_PREVIEW_LIMIT,
  UNREAD_PREVIEW_LIMIT,
  unreadPreviewLabel,
} from "./MatchList";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

const mockNavigate = jest.fn();

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  db: {},
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("framer-motion", () => {
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get: (_target, tag) =>
          ({ initial, animate, transition, ...props }) =>
            React.createElement(tag, props),
      },
    ),
  };
});

jest.mock("firebase/firestore", () => {
  return {
    collection: jest.fn(),
    doc: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    query: jest.fn(),
    onSnapshot: jest.fn(),
  };
});

function matchDocument(id, otherUid, displayName) {
  return {
    id,
    data: () => ({
      participants: ["traveler-a", otherUid],
      matched: true,
      userA: "traveler-a",
      userB: otherUid,
      userAProfile: { uid: "traveler-a", displayName: "Ari", media: [] },
      userBProfile: {
        uid: otherUid,
        displayName,
        media: [`https://cdn.example/${otherUid}.jpg`],
      },
    }),
  };
}

describe("MatchList live connections", () => {
  let emitMatches;
  let failMatches;
  let emitUnread;

  beforeEach(() => {
    jest.clearAllMocks();
    emitMatches = null;
    failMatches = null;
    emitUnread = null;
    collection.mockImplementation((_db, ...path) => ({
      kind: "collection",
      path: path.join("/"),
    }));
    doc.mockImplementation((_db, ...path) => ({
      kind: "doc",
      path: path.join("/"),
    }));
    where.mockImplementation((field, operator, value) => ({
      kind: "where",
      field,
      operator,
      value,
    }));
    orderBy.mockImplementation((field, direction) => ({
      kind: "orderBy",
      field,
      direction,
    }));
    limit.mockImplementation((value) => ({ kind: "limit", value }));
    query.mockImplementation((source, ...constraints) => ({
      kind: "query",
      path: source.path,
      constraints,
    }));
    onSnapshot.mockImplementation((target, next, error) => {
      if (target.path === "matches") {
        emitMatches = next;
        failMatches = error;
      } else if (target.kind === "doc") {
        next({ data: () => ({ typing: false }) });
      } else if (
        target.constraints?.some(
          (constraint) =>
            constraint.kind === "limit" &&
            constraint.value === UNREAD_PREVIEW_LIMIT,
        )
      ) {
        emitUnread = next;
        next({ docs: [] });
      } else {
        next({ docs: [] });
      }
      return jest.fn();
    });
  });

  it("shows a mutual connection that arrives while the page is open", async () => {
    render(<MatchList />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledWith(CONNECTION_PREVIEW_LIMIT);

    await act(async () => {
      emitMatches({ docs: [matchDocument("match-one", "traveler-b", "Bea")] });
    });
    expect(screen.getAllByText("Bea").length).toBeGreaterThan(0);

    await act(async () => {
      emitMatches({
        docs: [
          matchDocument("match-one", "traveler-b", "Bea"),
          matchDocument("match-two", "traveler-c", "Cam"),
        ],
      });
    });
    expect(screen.getAllByText("Cam").length).toBeGreaterThan(0);
  });

  it("bounds incoming unread previews and labels the capped count honestly", async () => {
    render(<MatchList />);

    await act(async () => {
      emitMatches({ docs: [matchDocument("match-one", "traveler-b", "Bea")] });
    });

    expect(where).toHaveBeenCalledWith("senderId", "==", "traveler-b");
    expect(limit).toHaveBeenCalledWith(UNREAD_PREVIEW_LIMIT);
    expect(unreadPreviewLabel(4)).toBe("4");
    expect(unreadPreviewLabel(UNREAD_PREVIEW_LIMIT)).toBe("99+");

    await act(async () => {
      emitUnread({
        docs: Array.from({ length: UNREAD_PREVIEW_LIMIT }, () => ({
          data: () => ({ senderId: "traveler-b" }),
        })),
      });
    });

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("guides an empty connection list back to shared play", async () => {
    render(<MatchList />);

    await act(async () => {
      emitMatches({ docs: [] });
    });

    expect(screen.getByText("No mutual Sparks yet.")).toBeInTheDocument();
    expect(screen.getByText(/one-way interest stays private/i)).toBeInTheDocument();
    screen.getByRole("button", { name: "Enter Afterlight" }).click();
    expect(mockNavigate).toHaveBeenCalledWith("/app/explore");
  });

  it("shows a retryable failure instead of an empty state when the base query fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<MatchList />);

    await act(async () => {
      failMatches(new Error("network unavailable"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /connections could not be loaded/i,
    );
    expect(screen.queryByText("No mutual Sparks yet.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
