import { fireEvent, render, screen } from "@testing-library/react";
import NightJourneyCard from "./NightJourneyCard";

const baseJourney = {
  id: "afterlight:test",
  keepsake: null,
};

const baseProgress = {
  completed: 1,
  total: 3,
  complete: false,
  stages: [
    {
      id: "wander",
      label: "Follow the shoreline",
      detail: "Two places found",
      complete: true,
    },
    {
      id: "moment",
      label: "Leave a small trace",
      detail: "Try any place activity",
      complete: false,
    },
    {
      id: "choice",
      label: "Choose your pace",
      detail: "Share, Spark, wave, or take quiet",
      complete: false,
    },
  ],
};

function renderCard(overrides = {}) {
  return render(
    <NightJourneyCard
      city="Afterlight"
      event="Lantern Thread"
      eventTime="Dusk until late"
      weather="Warm tide"
      journey={baseJourney}
      progress={baseProgress}
      keepsakeCount={2}
      sharedMomentCount={3}
      controlsHint="WASD · E interact"
      onRestart={jest.fn()}
      {...overrides}
    />,
  );
}

describe("NightJourneyCard", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
  });

  it("presents the current thread as readable progress", () => {
    renderCard();

    expect(
      screen.getByRole("progressbar", {
        name: "1 of 3 night-thread beats complete",
      }),
    ).toHaveAttribute("value", "1");
    expect(screen.getAllByText("Leave a small trace")).toHaveLength(2);
    expect(screen.getByText(/2 keepsakes · 3 shared moments/)).toBeInTheDocument();
  });

  it("keeps completion and replay as separate, explicit actions", () => {
    const onRestart = jest.fn();
    renderCard({
      onRestart,
      journey: {
        id: "afterlight:complete",
        keepsake: {
          title: "Moonwater Pause",
          note: "You made room for the night.",
          prompt: "What kind of quiet helps?",
          color: "#8ad6c6",
        },
      },
      progress: {
        ...baseProgress,
        completed: 3,
        complete: true,
        stages: baseProgress.stages.map((stage) => ({
          ...stage,
          complete: true,
        })),
      },
    });

    expect(screen.getAllByText("Moonwater Pause")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Follow another thread" }),
    );
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("starts compact on a small screen and expands on request", () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    renderCard();

    const toggle = screen.getByRole("button", { name: /Lantern Thread/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Dusk until late")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Dusk until late")).toBeInTheDocument();
  });
});
