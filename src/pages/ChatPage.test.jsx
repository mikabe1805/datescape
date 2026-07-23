import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useTypingStatus } from "../utils/TypingIndicator";
import ChatPage, {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  markIncomingMessagesRead,
  scrollTopAfterPrepend,
  validateChatAttachment,
} from "./ChatPage";

const mockNavigate = jest.fn();
const mockTypingAction = jest.fn();
let mockMatchNext;
let mockMatchData;
let mockMessages;

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ matchId: "traveler-a_traveler-b" }),
}));

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  db: { name: "db" },
  storage: { name: "storage" },
}));

jest.mock("firebase/firestore", () => {
  const makePath = (segments) =>
    segments
      .slice(1)
      .map((segment) => segment?.path || segment)
      .join("/");

  return {
    collection: jest.fn((...segments) => ({
      kind: "collection",
      path: makePath(segments),
    })),
    doc: jest.fn((...segments) => {
      if (segments.length === 1 && segments[0]?.kind === "collection") {
        return {
          id: "prepared-message",
          kind: "doc",
          path: `${segments[0].path}/prepared-message`,
        };
      }
      return { kind: "doc", path: makePath(segments) };
    }),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn((target, next) => {
      if (target.kind === "doc" && target.path === "matches/traveler-a_traveler-b") {
        mockMatchNext = next;
        next({
          exists: () => Boolean(mockMatchData),
          data: () => mockMatchData,
        });
      } else if (target.path === "matches/traveler-a_traveler-b/messages") {
        next({
          docs: mockMessages.map((message) => ({
            id: message.id,
            data: () => message,
          })),
        });
      }
      return jest.fn();
    }),
    orderBy: jest.fn((field, direction) => ({ field, direction })),
    query: jest.fn((base) => ({ ...base, kind: "query" })),
    serverTimestamp: jest.fn(() => "server-time"),
    setDoc: jest.fn(() => Promise.resolve()),
    startAfter: jest.fn(),
    updateDoc: jest.fn(() => Promise.resolve()),
    writeBatch: jest.fn(() => ({
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  };
});

jest.mock("firebase/storage", () => ({
  deleteObject: jest.fn(() => Promise.resolve()),
  ref: jest.fn((_storage, path) => ({ path })),
  uploadBytes: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() => Promise.resolve("https://example.test/media")),
}));

jest.mock("framer-motion", () => {
  const ActualReact = require("react");
  return {
    motion: {
      div: ActualReact.forwardRef(
        ({ children, ...props }, ref) => {
          const domProps = { ...props };
          delete domProps.initial;
          delete domProps.animate;
          delete domProps.transition;
          return (
            <div ref={ref} {...domProps}>
              {children}
            </div>
          );
        },
      ),
      img: ActualReact.forwardRef(
        (props, ref) => {
          const domProps = { ...props };
          delete domProps.initial;
          delete domProps.animate;
          delete domProps.transition;
          return <img ref={ref} {...domProps} alt={domProps.alt || ""} />;
        },
      ),
    },
  };
});

jest.mock("emoji-picker-react", () => () => <div>Emoji picker</div>);

jest.mock("../utils/RecordingPopup", () => ({ isRecording }) =>
  isRecording ? <div>Recording voice message</div> : null,
);

jest.mock("../utils/TypingIndicator", () => ({
  useTypingStatus: jest.fn(() => mockTypingAction),
  useListenToTyping: jest.fn(),
}));

jest.mock("../utils/MatchActions", () => ({
  blockUser: jest.fn(() => Promise.resolve()),
  reportUser: jest.fn(() => Promise.resolve()),
}));

function activeMatch(overrides = {}) {
  return {
    participants: ["traveler-a", "traveler-b"],
    userA: "traveler-a",
    userB: "traveler-b",
    userAProfile: { displayName: "Ari" },
    userBProfile: { displayName: "Briar" },
    matched: true,
    isActiveA: false,
    isActiveB: false,
    ...overrides,
  };
}

function messageDocument(message) {
  return {
    id: message.id,
    data: () => message,
  };
}

function fullLivePage() {
  return Array.from({ length: 50 }, (_, index) => {
    const sequence = 100 - index;
    return {
      id: `message-${sequence}`,
      senderId: sequence % 2 ? "traveler-a" : "traveler-b",
      type: "text",
      text: `Message ${sequence}`,
      isRead: true,
      timestamp: { seconds: sequence },
    };
  });
}

function publishMatch(nextData) {
  act(() => {
    mockMatchNext({
      exists: () => Boolean(nextData),
      data: () => nextData,
    });
  });
}

describe("ChatPage connection lifecycle", () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockMatchNext = undefined;
    mockMatchData = activeMatch();
    mockMessages = [
      {
        id: "hello",
        senderId: "traveler-b",
        type: "text",
        text: "A quiet hello",
        isRead: true,
        timestamp: { seconds: 10 },
      },
    ];
    window.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: jest.fn() },
    });

    collection.mockImplementation((_db, ...segments) => ({
      kind: "collection",
      path: segments.join("/"),
    }));
    doc.mockImplementation((first, ...segments) => {
      if (first?.kind === "collection" && segments.length === 0) {
        return {
          id: "prepared-message",
          kind: "doc",
          path: `${first.path}/prepared-message`,
        };
      }
      return { kind: "doc", path: segments.join("/") };
    });
    query.mockImplementation((base, ...constraints) => ({
      ...base,
      kind: "query",
      constraints,
    }));
    orderBy.mockImplementation((field, direction) => ({ field, direction }));
    limit.mockImplementation((value) => ({ kind: "limit", value }));
    startAfter.mockImplementation((cursor) => ({ kind: "startAfter", cursor }));
    serverTimestamp.mockReturnValue("server-time");
    getDocs.mockResolvedValue({ docs: [] });
    setDoc.mockResolvedValue(undefined);
    updateDoc.mockResolvedValue(undefined);
    writeBatch.mockReturnValue({
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    });
    onSnapshot.mockImplementation((target, next) => {
      if (target.kind === "doc" && target.path === "matches/traveler-a_traveler-b") {
        mockMatchNext = next;
        next({
          exists: () => Boolean(mockMatchData),
          data: () => mockMatchData,
        });
      } else if (target.path === "matches/traveler-a_traveler-b/messages") {
        next({
          docs: mockMessages.map(messageDocument),
        });
      }
      return jest.fn();
    });
    ref.mockImplementation((_storage, path) => ({ path }));
    uploadBytes.mockResolvedValue(undefined);
    deleteObject.mockResolvedValue(undefined);
    getDownloadURL.mockResolvedValue("https://example.test/media");
    useTypingStatus.mockReturnValue(mockTypingAction);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("keeps ended and invalid conversations visible as read-only history", async () => {
    render(<ChatPage />);

    const composer = await screen.findByPlaceholderText("Write something…");
    expect(screen.getByText("A quiet hello")).toBeInTheDocument();
    expect(composer).toBeEnabled();
    expect(useTypingStatus).toHaveBeenLastCalledWith(
      "traveler-a_traveler-b",
      "traveler-a",
    );

    publishMatch(activeMatch({ matched: false }));

    expect(screen.getByText("This connection has ended")).toBeInTheDocument();
    expect(screen.getByText("A quiet hello")).toBeInTheDocument();
    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Emoji" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByLabelText("Attach media")).toBeDisabled();
    expect(useTypingStatus).toHaveBeenLastCalledWith(null, "traveler-a");

    fireEvent.doubleClick(screen.getByText("A quiet hello"));
    expect(updateDoc).not.toHaveBeenCalled();

    publishMatch(null);
    expect(screen.getByText("Conversation unavailable")).toBeInTheDocument();
    expect(screen.getByText("A quiet hello")).toBeInTheDocument();
  });

  it("keeps the draft and announces a send failure inline", async () => {
    setDoc.mockRejectedValueOnce(new Error("offline"));
    render(<ChatPage />);

    const composer = await screen.findByPlaceholderText("Write something…");
    fireEvent.change(composer, { target: { value: "Stay awhile" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your message could not be sent",
    );
    expect(composer).toHaveValue("Stay awhile");
  });

  it("bounds the live query and prepends deduplicated cursor pages", async () => {
    mockMessages = fullLivePage();
    getDocs.mockResolvedValueOnce({
      docs: [
        messageDocument({
          ...mockMessages[mockMessages.length - 1],
          text: "Duplicate boundary",
        }),
        messageDocument({
          id: "message-50",
          senderId: "traveler-b",
          type: "text",
          text: "Message 50",
          isRead: true,
          timestamp: { seconds: 50 },
        }),
        messageDocument({
          id: "message-49",
          senderId: "traveler-a",
          type: "text",
          text: "Message 49",
          isRead: true,
          timestamp: { seconds: 49 },
        }),
      ],
    });

    render(<ChatPage />);

    const loadEarlier = await screen.findByRole("button", {
      name: "Load earlier messages",
    });
    const history = screen.getByRole("region", {
      name: "Conversation history",
    });
    Object.defineProperty(history, "scrollHeight", {
      configurable: true,
      get: () => screen.getAllByRole("article").length * 20,
    });
    history.scrollTop = 240;
    expect(orderBy).toHaveBeenCalledWith("timestamp", "desc");
    expect(limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenLastCalledWith(50);

    fireEvent.click(loadEarlier);
    await screen.findByText("Message 49");

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(startAfter).toHaveBeenCalledTimes(1);
    expect(startAfter.mock.calls[0][0].id).toBe("message-51");
    expect(limit).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Message 51")).toHaveLength(1);

    const renderedMessages = screen.getAllByRole("article");
    expect(renderedMessages[0]).toHaveTextContent("Message 49");
    expect(renderedMessages[1]).toHaveTextContent("Message 50");
    expect(renderedMessages[2]).toHaveTextContent("Message 51");
    expect(history.scrollTop).toBe(280);
  });

  it("computes a stable viewport offset from the prepended height", () => {
    expect(scrollTopAfterPrepend(240, 1000, 1400)).toBe(640);
    expect(scrollTopAfterPrepend(240, 1000, 900)).toBe(240);
  });

  it("mirrors the bounded attachment types and sizes enforced by Storage", () => {
    expect(
      validateChatAttachment({
        type: "image/png",
        size: CHAT_IMAGE_MAX_BYTES,
      }),
    ).toEqual(
      expect.objectContaining({ ok: true, kind: "image" }),
    );
    expect(
      validateChatAttachment({
        type: "video/quicktime",
        size: CHAT_VIDEO_MAX_BYTES,
      }),
    ).toEqual(
      expect.objectContaining({ ok: true, kind: "video" }),
    );
    expect(
      validateChatAttachment({
        type: "image/png",
        size: CHAT_IMAGE_MAX_BYTES + 1,
      }),
    ).toEqual(expect.objectContaining({ ok: false, reason: "size" }));
    expect(
      validateChatAttachment({ type: "application/pdf", size: 100 }),
    ).toEqual({ ok: false, reason: "type" });
  });

  it("batches recipient receipts during the normal active-chat path", async () => {
    const batch = {
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    };
    writeBatch.mockReturnValueOnce(batch);

    await markIncomingMessagesRead("traveler-a_traveler-b", [
      { id: "incoming-1" },
      { id: "incoming-2" },
    ]);

    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it("isolates stale receipt races when another device wins one update", async () => {
    const batch = {
      update: jest.fn(),
      commit: jest.fn(() => Promise.reject(new Error("stale receipt"))),
    };
    writeBatch.mockReturnValueOnce(batch);
    updateDoc
      .mockRejectedValueOnce(new Error("already read"))
      .mockResolvedValueOnce(undefined);

    await expect(
      markIncomingMessagesRead("traveler-a_traveler-b", [
        { id: "incoming-1" },
        { id: "incoming-2" },
      ]),
    ).resolves.toBeUndefined();

    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(updateDoc.mock.calls.map(([, value]) => value)).toEqual([
      { isRead: true },
      { isRead: true },
    ]);
  });

  it("announces an earlier-page failure and keeps the retry available", async () => {
    mockMessages = fullLivePage();
    getDocs.mockRejectedValueOnce(new Error("offline"));
    render(<ChatPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Load earlier messages" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Earlier messages could not be loaded",
    );
    expect(
      screen.getByRole("button", { name: "Load earlier messages" }),
    ).toBeEnabled();
  });

  it("announces attachment and microphone failures inline", async () => {
    uploadBytes.mockRejectedValueOnce(new Error("upload failed"));
    render(<ChatPage />);

    await screen.findByPlaceholderText("Write something…");
    const fileInput = screen.getByLabelText("Attach media");
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["image"], "lantern.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your attachment could not be uploaded",
    );

    window.navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(
      new Error("permission denied"),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Voice" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Voice" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Voice recording could not start",
    );
  });

  it("removes an uploaded attachment when the message write fails", async () => {
    setDoc.mockRejectedValueOnce(new Error("connection ended"));
    render(<ChatPage />);

    await screen.findByPlaceholderText(/Write something/);
    fireEvent.change(screen.getByLabelText("Attach media"), {
      target: {
        files: [new File(["image"], "lantern.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your attachment could not be sent",
    );
    await waitFor(() => expect(deleteObject).toHaveBeenCalledTimes(1));
    expect(deleteObject.mock.calls[0][0].path).toContain(
      "chatMedia/traveler-a_traveler-b/traveler-a/prepared-message/",
    );
  });

  it("rejects unsupported attachments before creating a Storage object", async () => {
    render(<ChatPage />);

    await screen.findByPlaceholderText(/Write something/);
    fireEvent.change(screen.getByLabelText("Attach media"), {
      target: {
        files: [
          { name: "private.pdf", size: 100, type: "application/pdf" },
        ],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, WebP, GIF, MP4, WebM, or QuickTime attachment",
    );
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});
