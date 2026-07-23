import { fireEvent, render, screen } from "@testing-library/react";
import SharedMomentAfterglow from "./SharedMomentAfterglow";

const opponent = { uid: "b", name: "Bea" };

describe("SharedMomentAfterglow", () => {
  it("keeps completion credit separate from continued contact", () => {
    const onReturn = jest.fn();
    const onViewProfile = jest.fn();
    render(
      <SharedMomentAfterglow
        mode="resonance"
        opponent={opponent}
        prompt="What kind of quiet do you enjoy sharing?"
        onReturn={onReturn}
        onReplay={jest.fn()}
        onViewProfile={onViewProfile}
      />,
    );

    expect(screen.getByText(/duet already counts/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the district" }),
    );
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onViewProfile).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "View Bea’s calling card" }),
    );
    expect(onViewProfile).toHaveBeenCalledTimes(1);
  });

  it("holds exit choices until both players have received the result", () => {
    render(
      <SharedMomentAfterglow
        mode="resonance"
        opponent={opponent}
        ready={false}
        onReturn={jest.fn()}
        onReplay={jest.fn()}
        onViewProfile={jest.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/both players/i);
    expect(
      screen.getByRole("button", { name: "Return to the district" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "View Bea’s calling card" }),
    ).toBeDisabled();
  });

  it("offers an explicit private Spark or penalty-free pass", () => {
    const onSpark = jest.fn();
    const onPass = jest.fn();
    render(
      <SharedMomentAfterglow
        mode="social"
        opponent={opponent}
        encounter={{
          id: "encounter:one",
          state: "open",
          response: null,
          opponent,
        }}
        onReturn={jest.fn()}
        onReplay={jest.fn()}
        onViewProfile={jest.fn()}
        onSpark={onSpark}
        onPass={onPass}
      />,
    );

    expect(screen.getByText(/choice never changes rewards/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Send private Spark" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pass — nothing sent" }),
    );
    expect(onSpark).toHaveBeenCalledWith("encounter:one");
    expect(onPass).toHaveBeenCalledWith("encounter:one");
  });

  it("does not block Return or Replay while a response awaits server confirmation", () => {
    const onReturn = jest.fn();
    const onReplay = jest.fn();
    render(
      <SharedMomentAfterglow
        mode="resonance"
        opponent={opponent}
        encounter={{ id: "encounter:one", state: "open", opponent }}
        encounterBusy
        onReturn={onReturn}
        onReplay={onReplay}
        onViewProfile={jest.fn()}
        onSpark={jest.fn()}
        onPass={jest.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /may still return to the district/i,
    );
    expect(
      screen.getByRole("button", { name: "Confirming…" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the district" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Join another moment" }),
    );
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("keeps exit choices usable while the trusted encounter is loading", () => {
    const onReturn = jest.fn();
    const onReplay = jest.fn();
    render(
      <SharedMomentAfterglow
        mode="resonance"
        opponent={opponent}
        encounterLoading
        onReturn={onReturn}
        onReplay={onReplay}
        onViewProfile={jest.fn()}
        onSpark={jest.fn()}
        onPass={jest.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /preparing private continuation choices/i,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the district" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Join another moment" }),
    );
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("never renders Spark controls without a verified encounter", () => {
    render(
      <SharedMomentAfterglow
        mode="resonance"
        opponent={opponent}
        encounterError="Private continuation choices are unavailable."
        onReturn={jest.fn()}
        onReplay={jest.fn()}
        onViewProfile={jest.fn()}
        onSpark={jest.fn()}
        onPass={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Send private Spark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pass — nothing sent" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/return or replay without changing/i)).toBeInTheDocument();
  });

  it.each([
    ["pending", /Spark was sent privately/i, /only hear about it if/i],
    ["mutual", /Spark is mutual/i, /private connection is ready/i],
    ["passed", /Nothing was sent/i, /penalty-free/i],
  ])("renders the server-confirmed %s state", (state, title, body) => {
    render(
      <SharedMomentAfterglow
        mode="social"
        opponent={opponent}
        encounter={{ id: "encounter:one", state, opponent }}
        onReturn={jest.fn()}
        onReplay={jest.fn()}
        onViewProfile={jest.fn()}
        onSpark={jest.fn()}
        onPass={jest.fn()}
      />,
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send private Spark" }),
    ).not.toBeInTheDocument();
  });
});
