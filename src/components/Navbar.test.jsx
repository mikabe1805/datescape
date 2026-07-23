import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Navbar, { NOTIFICATION_PREVIEW_LIMIT } from "./Navbar";

const mockNavigate = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn(() => Promise.resolve());

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  db: {},
}));

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/app/explore" }),
  useNavigate: () => mockNavigate,
}));

jest.mock("lucide-react", () => {
  const React = require("react");
  const Icon = (props) => <svg aria-hidden="true" {...props} />;
  return {
    Bell: Icon,
    Globe: Icon,
    Heart: Icon,
    Sparkles: Icon,
    User: Icon,
  };
});

jest.mock("./NotificationPopup", () => ({
  notifications,
  onMarkAllRead,
}) => (
  <div>
    <span>{notifications.length} loaded alerts</span>
    <button type="button" onClick={onMarkAllRead}>
      Mark loaded alerts read
    </button>
  </div>
));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(),
}));

describe("Navbar bounded notification preview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    collection.mockReturnValue({ path: "users/traveler-a/notifications" });
    doc.mockImplementation((_db, path, id) => ({ path, id }));
    orderBy.mockImplementation((field, direction) => ({ field, direction }));
    limit.mockImplementation((value) => ({ kind: "limit", value }));
    query.mockImplementation((source, ...constraints) => ({
      ...source,
      constraints,
    }));
    onSnapshot.mockImplementation((_target, next) => {
      next({
        docs: Array.from({ length: NOTIFICATION_PREVIEW_LIMIT }, (_, index) => ({
          id: `notification-${index}`,
          data: () => ({ read: false, type: "new_match" }),
        })),
      });
      return jest.fn();
    });
    writeBatch.mockReturnValue({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    });
    updateDoc.mockResolvedValue(undefined);
  });

  it("loads only the newest 100 alerts and marks only that bounded window", async () => {
    render(<Navbar />);

    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledWith(NOTIFICATION_PREVIEW_LIMIT);

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(
      screen.getByText(`${NOTIFICATION_PREVIEW_LIMIT} loaded alerts`),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark loaded alerts read" }),
    );

    await waitFor(() => expect(mockBatchCommit).toHaveBeenCalledTimes(1));
    expect(mockBatchUpdate).toHaveBeenCalledTimes(NOTIFICATION_PREVIEW_LIMIT);
  });
});
