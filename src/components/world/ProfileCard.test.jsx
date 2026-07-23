import { render, screen, waitFor } from "@testing-library/react";
import { getWorldCallingCard } from "../../game/sharedEncounter";
import ProfileCard from "./ProfileCard";

jest.mock("../../game/sharedEncounter", () => ({
  getWorldCallingCard: jest.fn(),
}));

const callbacks = {
  onClose: jest.fn(),
  onLike: jest.fn(),
  onWave: jest.fn(),
  onInvite: jest.fn(),
  onMute: jest.fn(),
  onBlock: jest.fn(),
  onReport: jest.fn(),
  onOpenConnection: jest.fn(),
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ProfileCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders only the callable calling-card projection", async () => {
    getWorldCallingCard.mockResolvedValue({
      profile: {
        uid: "b",
        displayName: "Bea",
        photoUrl: null,
        bio: "I collect tiny ceramic moons.",
        age: 29,
        lookingFor: "Kind adventures",
        interests: ["Ceramics", "Night markets"],
        email: "private@example.com",
      },
      error: null,
    });
    render(
      <ProfileCard
        {...callbacks}
        uid="b"
        name="Presence name"
        color="#72e6cf"
        intent="friends"
      />,
    );

    expect(getWorldCallingCard).toHaveBeenCalledWith("b");
    expect(await screen.findByText("Bea")).toBeInTheDocument();
    expect(screen.getByText("I collect tiny ceramic moons.")).toBeInTheDocument();
    expect(screen.getByText(/29 · Kind adventures/)).toBeInTheDocument();
    expect(screen.queryByText(/private@example/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send spark/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Spark only when a verified caller explicitly allows it", async () => {
    getWorldCallingCard.mockResolvedValue({
      profile: {
        uid: "b",
        displayName: "Bea",
        photoUrl: null,
        bio: "Hello",
        age: null,
        lookingFor: null,
        interests: [],
      },
      error: null,
    });
    render(
      <ProfileCard
        {...callbacks}
        uid="b"
        name="Bea"
        intent="friends"
        sparkAllowed
      />,
    );
    expect(
      await screen.findByRole("button", { name: /send spark/i }),
    ).toBeEnabled();
  });

  it("ignores a calling card response from a prior target", async () => {
    const first = deferred();
    const second = deferred();
    getWorldCallingCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(
      <ProfileCard {...callbacks} uid="a" name="Ari" intent="meet" />,
    );
    rerender(
      <ProfileCard {...callbacks} uid="b" name="Bea" intent="friends" />,
    );

    second.resolve({
      profile: {
        uid: "b",
        displayName: "Bea",
        photoUrl: null,
        bio: "Current card",
        age: null,
        lookingFor: null,
        interests: [],
      },
      error: null,
    });
    expect(await screen.findByText("Current card")).toBeInTheDocument();

    first.resolve({
      profile: {
        uid: "a",
        displayName: "Ari",
        photoUrl: null,
        bio: "Stale card",
        age: null,
        lookingFor: null,
        interests: [],
      },
      error: null,
    });
    await waitFor(() =>
      expect(screen.queryByText("Stale card")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Current card")).toBeInTheDocument();
  });

  it("keeps the calling card dismissible when the callable is unavailable", async () => {
    getWorldCallingCard.mockResolvedValue({
      profile: null,
      error: "This calling card is unavailable.",
    });
    render(
      <ProfileCard {...callbacks} uid="b" name="Bea" intent="friends" />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /calling card is unavailable/i,
    );
    expect(
      screen.getByRole("button", { name: /close calling card/i }),
    ).toBeEnabled();
  });
});
