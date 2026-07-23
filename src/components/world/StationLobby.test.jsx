import { act, fireEvent, render, screen } from "@testing-library/react";
import StationLobby from "./StationLobby";

describe("StationLobby Resonance Echo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-19T20:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("counts down a solo fallback without presenting it as a shared moment", () => {
    render(
      <StationLobby
        stationName="Resonance Loom"
        mode="resonance"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        echoAvailableAt={Date.now() + 90_000}
        onEcho={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Echo guide in 90s")).toBeInTheDocument();
    expect(screen.getByText(/creates no shared encounter/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Echo available in 90s" }),
    ).toBeDisabled();
  });

  test("enables Echo after the server-provided wait matures", () => {
    const onEcho = jest.fn();
    render(
      <StationLobby
        stationName="Resonance Loom"
        mode="resonance"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        echoAvailableAt={Date.now() + 1_000}
        onEcho={onEcho}
        onCancel={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1_100);
    });
    const button = screen.getByRole("button", {
      name: "Follow the Echo alone",
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onEcho).toHaveBeenCalledTimes(1);
  });

  test("uses the trusted server clock instead of the device clock", () => {
    render(
      <StationLobby
        stationName="Resonance Loom"
        mode="resonance"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        echoAvailableAt={91_000}
        echoServerNow={1_000}
        onEcho={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Echo guide in 90s")).toBeInTheDocument();
  });

  test("hides Echo as soon as another traveler joins", () => {
    render(
      <StationLobby
        stationName="Resonance Loom"
        mode="resonance"
        myUid="traveler-a"
        seats={{
          "traveler-a": { sitAt: 1, name: "A" },
          "traveler-b": { sitAt: 2, name: "B" },
        }}
        echoAvailableAt={Date.now()}
        onEcho={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Follow the Echo alone" }),
    ).not.toBeInTheDocument();
  });

  test("offers an in-place retry when the trusted wait could not start", () => {
    const onEchoRetry = jest.fn();
    render(
      <StationLobby
        stationName="Resonance Loom"
        mode="resonance"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        echoError="Resonance Echo is unavailable right now."
        onEcho={jest.fn()}
        onEchoRetry={onEchoRetry}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry Echo guide" }));
    expect(onEchoRetry).toHaveBeenCalledTimes(1);
  });

  test("gives a consent-safe exit after a social queue stays empty", () => {
    render(
      <StationLobby
        stationName="Listening Crescent"
        mode="social"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        waitTimeoutMs={1_000}
        onCancel={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1_250);
    });

    expect(screen.getByText("No one else has joined yet.")).toBeInTheDocument();
    expect(screen.getByText(/no choice has been recorded/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Return to district" }),
    ).toBeEnabled();
  });

  test("turns a station subscription error into a clear recovery path", () => {
    render(
      <StationLobby
        stationName="Listening Crescent"
        mode="social"
        myUid="traveler-a"
        seats={{ "traveler-a": { sitAt: Date.now(), name: "A" } }}
        error="permission-denied"
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The queue lost its connection.",
    );
    expect(
      screen.getByRole("button", { name: "Return to district" }),
    ).toBeEnabled();
  });
});
