import React from "react";
import { render, screen } from "@testing-library/react";
import {
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import AllMatchesPage, { CONNECTION_PAGE_SIZE } from "./AllMatchesPage";

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

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(() => ({ kind: "collection", path: "matches" })),
  getDocs: jest.fn(),
  limit: jest.fn((value) => ({ kind: "limit", value })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn((field, direction) => ({
    kind: "orderBy",
    field,
    direction,
  })),
  query: jest.fn((source, ...constraints) => ({ source, constraints })),
  startAfter: jest.fn(),
  where: jest.fn((field, operator, value) => ({
    kind: "where",
    field,
    operator,
    value,
  })),
}));

describe("AllMatchesPage pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onSnapshot.mockImplementation((_target, next) => {
      next({ docs: [] });
      return jest.fn();
    });
  });

  it("subscribes only to the newest bounded page", () => {
    render(<AllMatchesPage />);

    expect(where).toHaveBeenCalledWith(
      "participants",
      "array-contains",
      "traveler-a",
    );
    expect(where).toHaveBeenCalledWith("matched", "==", true);
    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledWith(CONNECTION_PAGE_SIZE);
    expect(query).toHaveBeenCalled();
  });

  it("routes the empty state back into shared play", () => {
    render(<AllMatchesPage />);

    screen.getByRole("button", { name: "Enter Afterlight" }).click();
    expect(mockNavigate).toHaveBeenCalledWith("/app/explore");
  });
});
