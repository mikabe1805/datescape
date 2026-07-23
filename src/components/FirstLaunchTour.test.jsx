import { act, fireEvent, render, screen } from "@testing-library/react";
import FirstLaunchTour, {
  firstLaunchTourStorageKey,
} from "./FirstLaunchTour";

describe("FirstLaunchTour account scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function finishDelay() {
    act(() => {
      jest.advanceTimersByTime(700);
    });
  }

  it("persists dismissal for the current UID without suppressing another account", () => {
    const { rerender } = render(<FirstLaunchTour uid="traveler-a" />);

    finishDelay();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      window.localStorage.getItem(firstLaunchTourStorageKey("traveler-a")),
    ).toBe("true");

    rerender(<FirstLaunchTour uid="traveler-b" />);
    finishDelay();

    expect(
      screen.getByRole("dialog", { name: "Welcome to DateScape" }),
    ).toBeInTheDocument();
  });

  it("does not schedule a tour without an authenticated UID", () => {
    render(<FirstLaunchTour />);
    finishDelay();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(firstLaunchTourStorageKey()).toBeNull();
    expect(
      window.localStorage.getItem("datescape:firstLaunchTourSeen"),
    ).toBeNull();
  });
});
