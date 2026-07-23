import { fireEvent, render, screen } from "@testing-library/react";
import RainlightRelayCard from "./RainlightRelayCard";

const event = {
  phase: "gathering",
  contributionCount: 2,
  targetCount: 4,
  contributorCount: 2,
  sourceCounts: { conservatory: 1, market: 1, resonance: 0 },
  resultMode: null,
};

describe("RainlightRelayCard", () => {
  it("shows aggregate progress without exposing contributor identities", () => {
    render(
      <RainlightRelayCard
        event={{ ...event, contributors: ["private-uid"] }}
        personal={{
          contributedSources: ["market"],
          availableSources: ["conservatory", "resonance"],
        }}
        echoSecondsRemaining={42}
        signedIn
      />,
    );

    expect(screen.getByText("Rainlight Relay")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "2 of 4 Rainlight contributions banked",
      }),
    ).toHaveAttribute("value", "2");
    expect(screen.getByText(/2 travelers · Two travelers can finish now/i)).toBeInTheDocument();
    expect(screen.getByText("Your light")).toBeInTheDocument();
    expect(screen.queryByText("private-uid")).not.toBeInTheDocument();
  });

  it("lets a signed-in nearby traveler bank an available source", () => {
    const onContribute = jest.fn();
    render(
      <RainlightRelayCard
        event={event}
        personal={{
          contributedSources: ["market"],
          availableSources: ["resonance"],
        }}
        nearbySourceId="resonance"
        canContribute
        signedIn
        onContribute={onContribute}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Bank Resonance Garden light" }),
    );
    expect(onContribute).toHaveBeenCalledWith("resonance");
  });

  it("offers a sign-in path and explains the non-blocking solo Echo route", () => {
    const onSignIn = jest.fn();
    render(
      <RainlightRelayCard
        event={{ ...event, phase: "echo-available", contributorCount: 1 }}
        personal={{ contributedSources: [], availableSources: [] }}
        nearbySourceId="market"
        onSignIn={onSignIn}
      />,
    );

    expect(screen.getByText(/Echo route open: one traveler can finish/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in to join the live relay" }),
    );
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("shows Echo completion as complete without inventing a fourth banked source", () => {
    render(
      <RainlightRelayCard
        event={{
          ...event,
          phase: "completed",
          contributionCount: 3,
          contributorCount: 1,
          sourceCounts: { conservatory: 1, market: 1, resonance: 1 },
          resultMode: "echo",
        }}
        personal={{ contributedSources: ["market"], availableSources: [] }}
        signedIn
      />,
    );

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Rainlight Relay complete" }),
    ).toHaveAttribute("value", "4");
    expect(screen.getByText(/solo Echo crossed the shore/i)).toBeInTheDocument();
    expect(screen.queryByText("4 banked")).not.toBeInTheDocument();
  });
});
