import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResonanceDuet, {
  RESONANCE_BEAT_MS,
  normalizeResonanceNote,
  resonanceConversation,
  resonanceParticipants,
  resonanceProgress,
  resonanceTiming,
} from "./ResonanceDuet";

const baseMatch = {
  id: "garden-duet-a-b",
  startedAt: 10_000,
  white: "a",
  black: "b",
  whiteName: "Ari",
  blackName: "Bea",
  whiteColor: "#75d8d0",
  blackColor: "#c4a7ff",
  notes: {},
};

const note = (tone, accuracy = 0.8) => ({ tone, accuracy, at: 10_100 });

describe("ResonanceDuet helpers", () => {
  it("normalizes supported notes and safely clamps timing accuracy", () => {
    expect(normalizeResonanceNote("tide")).toEqual({
      tone: "tide",
      accuracy: 0.5,
    });
    expect(normalizeResonanceNote({ tone: "ember", accuracy: 4 })).toEqual({
      tone: "ember",
      accuracy: 1,
    });
    expect(normalizeResonanceNote({ tone: "unknown" })).toBeNull();
  });

  it("uses a shared beat origin while keeping every timing result valid", () => {
    const peak = resonanceTiming(
      10_000 + RESONANCE_BEAT_MS / 2,
      10_000,
    );
    expect(peak).toEqual({ phase: 0.5, accuracy: 1, label: "On the glow" });

    const edge = resonanceTiming(10_000, 10_000);
    expect(edge.accuracy).toBe(0);
    expect(edge.label).toBe("Free echo");
  });

  it("derives the opponent and the first unfinished synchronized round", () => {
    const match = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { b: note("bloom") },
      },
    };
    expect(resonanceParticipants(match, "a").opponent).toEqual({
      uid: "b",
      name: "Bea",
      color: "#c4a7ff",
    });

    const progress = resonanceProgress(match, "a");
    expect(progress.completedRounds).toBe(1);
    expect(progress.activeRound).toBe(1);
    expect(progress.myNote).toBeNull();
    expect(progress.opponentNote.tone).toBe("bloom");
  });

  it("chooses a deterministic handoff from the shared pattern", () => {
    const completed = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { a: note("bloom"), b: note("tide") },
        2: { a: note("ember"), b: note("bloom") },
      },
    };
    expect(resonanceConversation(completed, "a")).toEqual(
      resonanceConversation(completed, "b"),
    );
  });
});

describe("ResonanceDuet", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("submits one optional-audio pulse for the local player", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(10_000 + RESONANCE_BEAT_MS / 2);
    const onPulse = jest.fn();
    render(
      <ResonanceDuet
        match={baseMatch}
        myUid="a"
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Play Tide" }));
      await Promise.resolve();
    });

    expect(onPulse).toHaveBeenCalledWith(0, "tide", 1);
    expect(screen.getByText(/traveling to Bea/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Ember" })).toBeDisabled();
  });

  it("advances only after both participants have contributed", () => {
    const { rerender } = render(
      <ResonanceDuet
        match={{
          ...baseMatch,
          notes: { 0: { a: note("tide") } },
        }}
        myUid="a"
        onPulse={jest.fn()}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );
    expect(screen.getByText("Round 1 of 3")).toBeInTheDocument();

    rerender(
      <ResonanceDuet
        match={{
          ...baseMatch,
          notes: { 0: { a: note("tide"), b: note("ember") } },
        }}
        myUid="a"
        onPulse={jest.fn()}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );
    expect(screen.getByText("Round 2 of 3")).toBeInTheDocument();
  });

  it("lets the player retry when the shared note is rejected", async () => {
    const onPulse = jest.fn().mockResolvedValue({
      ok: false,
      error: "offline",
    });
    render(
      <ResonanceDuet
        match={baseMatch}
        myUid="a"
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play Bloom" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play Tide" })).toBeEnabled(),
    );
  });

  it("hands the opponent to the final conversation and Spark continuation", () => {
    const onComplete = jest.fn();
    const completed = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { a: note("bloom"), b: note("tide") },
        2: { a: note("ember"), b: note("bloom") },
      },
    };
    render(
      <ResonanceDuet
        match={completed}
        myUid="a"
        onPulse={jest.fn()}
        onComplete={onComplete}
        onLeave={jest.fn()}
      />,
    );

    expect(screen.getByTestId("resonance-duet-complete")).toHaveTextContent(
      /private Spark/i,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Bea" }),
    );
    expect(onComplete).toHaveBeenCalledWith({
      uid: "b",
      name: "Bea",
      color: "#c4a7ff",
    });
  });

  it("records the authoritative result before any continuation choice", () => {
    const onResolved = jest.fn();
    const onComplete = jest.fn();
    const completed = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { a: note("bloom"), b: note("tide") },
        2: { a: note("ember"), b: note("bloom") },
      },
    };

    render(
      <ResonanceDuet
        match={completed}
        myUid="a"
        onPulse={jest.fn()}
        onResolved={onResolved}
        onComplete={onComplete}
        onLeave={jest.fn()}
      />,
    );

    expect(onResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: completed.id,
        opponent: expect.objectContaining({ uid: "b", name: "Bea" }),
      }),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("waits for the shared final note before offering continuation", async () => {
    let resolvePulse;
    const onPulse = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvePulse = resolve;
        }),
    );
    const almostComplete = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { a: note("bloom"), b: note("tide") },
        2: { b: note("bloom") },
      },
    };
    const { rerender } = render(
      <ResonanceDuet
        match={almostComplete}
        myUid="a"
        soundEnabled={false}
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play Ember" }));
    expect(screen.getByTestId("resonance-duet-syncing")).toHaveTextContent(
      /final tone land/i,
    );
    expect(
      screen.queryByRole("button", { name: "Continue with Bea" }),
    ).not.toBeInTheDocument();

    rerender(
      <ResonanceDuet
        match={{
          ...almostComplete,
          notes: {
            ...almostComplete.notes,
            2: { a: note("ember"), b: note("bloom") },
          },
        }}
        myUid="a"
        soundEnabled={false}
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    expect(screen.getByTestId("resonance-duet-syncing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Bea" }),
    ).not.toBeInTheDocument();

    await act(async () => resolvePulse({ ok: true }));

    expect(
      screen.getByRole("button", { name: "Continue with Bea" }),
    ).toBeInTheDocument();
  });

  it("keeps a successor duet gated when an old submission resolves", async () => {
    const resolvers = [];
    const onPulse = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const almostComplete = {
      ...baseMatch,
      notes: {
        0: { a: note("tide"), b: note("ember") },
        1: { a: note("bloom"), b: note("tide") },
        2: { b: note("bloom") },
      },
    };
    const successor = { ...almostComplete, id: "garden-duet-successor" };
    const { rerender } = render(
      <ResonanceDuet
        match={almostComplete}
        myUid="a"
        soundEnabled={false}
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play Ember" }));
    rerender(
      <ResonanceDuet
        match={successor}
        myUid="a"
        soundEnabled={false}
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Ember" }));
    rerender(
      <ResonanceDuet
        match={{
          ...successor,
          notes: {
            ...successor.notes,
            2: { a: note("ember"), b: note("bloom") },
          },
        }}
        myUid="a"
        soundEnabled={false}
        onPulse={onPulse}
        onComplete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    await act(async () => resolvers[0]({ ok: true }));
    expect(screen.getByTestId("resonance-duet-syncing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Bea" }),
    ).not.toBeInTheDocument();

    await act(async () => resolvers[1]({ ok: true }));
    expect(
      screen.getByRole("button", { name: "Continue with Bea" }),
    ).toBeInTheDocument();
  });
});
