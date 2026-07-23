import { httpsCallable } from "firebase/functions";
import { blockUser, reportPhoto, reportUser } from "./MatchActions";

const mockInvokeBlock = jest.fn();
const mockSubmitSafetyReport = jest.fn();

jest.mock("../firebase", () => ({
  auth: { currentUser: { uid: "traveler-a" } },
  db: {},
  functions: { name: "functions" },
}));

jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(),
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  updateDoc: jest.fn(),
}));

describe("blockUser authority", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    httpsCallable.mockImplementation((_functions, name) =>
      name === "blockWorldUser" ? mockInvokeBlock : mockSubmitSafetyReport,
    );
    mockInvokeBlock.mockResolvedValue({ data: { blocked: true } });
    mockSubmitSafetyReport.mockResolvedValue({ data: { submitted: true } });
  });

  it("uses the authenticated server callable instead of a client profile edit", async () => {
    await blockUser("traveler-b");

    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "functions" },
      "blockWorldUser",
    );
    expect(mockInvokeBlock).toHaveBeenCalledWith({ otherUid: "traveler-b" });
  });

  it("does not call authority for self-blocks", async () => {
    await blockUser("traveler-a");
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

describe("safety report payloads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    httpsCallable.mockReturnValue(mockSubmitSafetyReport);
    mockSubmitSafetyReport.mockResolvedValue({ data: { submitted: true } });
  });

  it("normalizes and bounds a private user-report reason", async () => {
    await reportUser("traveler-b", `  ${"x".repeat(1200)}  `);

    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "functions" },
      "submitSafetyReport",
    );
    expect(mockSubmitSafetyReport).toHaveBeenCalledWith({
      reportedUserId: "traveler-b",
      reason: "x".repeat(1000),
      type: "user",
    });
  });

  it("does not create self-reports", async () => {
    await reportUser("traveler-a", "test");
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("accepts only bounded HTTPS photo evidence URLs", async () => {
    await expect(
      reportPhoto("traveler-b", "http://example.test/photo.jpg", "Evidence"),
    ).rejects.toThrow("cannot be attached");
    expect(mockSubmitSafetyReport).not.toHaveBeenCalled();

    await reportPhoto(
      "traveler-b",
      "https://example.test/photo.jpg",
      " Evidence ",
    );
    expect(mockSubmitSafetyReport).toHaveBeenCalledWith({
      reportedUserId: "traveler-b",
      photoUrl: "https://example.test/photo.jpg",
      reason: "Evidence",
      type: "photo",
    });
  });
});
