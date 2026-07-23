import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SocialMoment from "./SocialMoment";

const match = {
  id: "listening-a-b",
  white: "a",
  black: "b",
  whiteName: "Ari",
  blackName: "Bea",
  whiteColor: "#75d8d0",
  blackColor: "#c4a7ff",
};

describe("SocialMoment", () => {
  it("keeps an early partner response hidden and asks before locking a choice", async () => {
    const onChoose = jest.fn().mockResolvedValue({ ok: true });
    render(
      <SocialMoment
        match={match}
        myUid="a"
        choices={{ b: { matchId: match.id, choiceId: "c" } }}
        onChoose={onChoose}
        onLeave={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Bea has responded. Their answer stays out of view in the card until you respond.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bea chose")).not.toBeInTheDocument();

    const firstChoice = screen.getAllByRole("radio")[0];
    fireEvent.click(firstChoice);
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lock my choice" }));

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith("a"));
  });

  it("automatically resolves once, reveals both answers, and continues separately", async () => {
    const onResolved = jest.fn();
    const onComplete = jest.fn();
    const choices = {
      a: { matchId: match.id, choiceId: "a" },
      b: { matchId: match.id, choiceId: "c" },
    };
    const { rerender } = render(
      <SocialMoment
        match={match}
        myUid="a"
        choices={choices}
        onResolved={onResolved}
        onComplete={onComplete}
        onLeave={jest.fn()}
      />,
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(screen.getByText("You chose")).toBeInTheDocument();
    expect(screen.getByText("Bea chose")).toBeInTheDocument();
    expect(
      screen.getByText("Two honest answers are better than a match score."),
    ).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent("Both answers revealed");

    rerender(
      <SocialMoment
        match={match}
        myUid="a"
        choices={choices}
        onResolved={onResolved}
        onComplete={onComplete}
        onLeave={jest.fn()}
      />,
    );
    expect(onResolved).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Carry this moment onward" }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: match.id, completed: true }),
    );
  });

  it("treats passing as a no-receipt round and does not reveal either answer", async () => {
    const onResolved = jest.fn();
    const onReplay = jest.fn();
    render(
      <SocialMoment
        match={match}
        myUid="a"
        choices={{
          a: { matchId: match.id, choiceId: "pass" },
        }}
        onResolved={onResolved}
        onReplay={onReplay}
        onLeave={jest.fn()}
      />,
    );

    expect(screen.getByText("Card passed kindly")).toBeInTheDocument();
    expect(screen.queryByText("Bea chose")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Carry this moment onward" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true, completed: false }),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Find another moment" }),
    );
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the partner leaves before both answers arrive", () => {
    const onReplay = jest.fn();
    render(
      <SocialMoment
        match={match}
        myUid="a"
        choices={{ a: { matchId: match.id, choiceId: "a" } }}
        partnerLeft
        onChoose={jest.fn()}
        onReplay={onReplay}
        onLeave={jest.fn()}
      />,
    );

    expect(screen.getByText("The reveal stayed closed")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Carry this moment onward" }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry when the participant-owned write fails", async () => {
    const onChoose = jest.fn().mockResolvedValue({ error: "offline" });
    render(
      <SocialMoment
        match={match}
        myUid="a"
        onChoose={onChoose}
        onLeave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Lock my choice" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That answer did not reach the Crescent",
    );
    expect(
      screen.getByRole("button", { name: "Lock my choice" }),
    ).toBeEnabled();
  });

  it("does not render choices for an unknown match-owned card", () => {
    render(
      <SocialMoment
        match={{ ...match, socialCardId: "invented-card" }}
        myUid="a"
        onChoose={jest.fn()}
        onLeave={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "This card cannot open safely" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("lets a player retry a failed shared-result handoff or still leave", () => {
    const onRetryHandoff = jest.fn();
    const onLeave = jest.fn();
    render(
      <SocialMoment
        match={match}
        myUid="a"
        choices={{
          a: { matchId: match.id, choiceId: "a" },
          b: { matchId: match.id, choiceId: "b" },
        }}
        handoffBusy
        handoffError
        onRetryHandoff={onRetryHandoff}
        onLeave={onLeave}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not confirm that both people can keep this result",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Try the handoff again" }),
    );
    expect(onRetryHandoff).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Leave kindly" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
