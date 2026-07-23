import { fireEvent, render, screen } from "@testing-library/react";
import QuestTracker from "./QuestTracker";

const quest = {
  id: "first-light",
  title: "First Light",
  description: "Carry a sleeping prism across Afterlight Shore.",
  status: "active",
};

const objective = {
  id: "resonate-together",
  position: 3,
  total: 4,
  label: "Tune the prism together",
  detail: "Complete one Resonance Loom duet with another player.",
};

describe("QuestTracker", () => {
  it("shows level progress, the ordered objective, and the quest reward", () => {
    render(
      <QuestTracker
        level={2}
        xpIntoLevel={25}
        xpNeededForNextLevel={100}
        quest={quest}
        objective={objective}
        reward={{ xp: 50, cosmeticLabel: "Sunthread scarf" }}
      />,
    );

    expect(screen.getByText("Level 2")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "25 of 100 XP toward level 3",
      }),
    ).toHaveAttribute("value", "25");
    expect(screen.getByText("Objective 3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Tune the prism together")).toBeInTheDocument();
    expect(screen.getByText("50 XP + Sunthread scarf")).toBeInTheDocument();
  });

  it("lets an available quest be accepted explicitly", () => {
    const onAccept = jest.fn();
    render(
      <QuestTracker
        quest={{ ...quest, status: "available" }}
        objective={{ ...objective, position: 1 }}
        reward={{ xp: 50, cosmeticLabel: "Sunthread scarf" }}
        onAccept={onAccept}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept quest" }));
    expect(onAccept).toHaveBeenCalledWith("first-light");
  });

  it("keeps reward claiming explicit and disables it while busy", () => {
    const onClaim = jest.fn();
    const { rerender } = render(
      <QuestTracker
        quest={{ ...quest, status: "ready-to-turn-in" }}
        objective={{ ...objective, position: 4 }}
        reward={{ xp: 50, cosmeticLabel: "Sunthread scarf" }}
        onClaim={onClaim}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Claim reward" }));
    expect(onClaim).toHaveBeenCalledWith("first-light");

    rerender(
      <QuestTracker
        quest={{ ...quest, status: "ready-to-turn-in" }}
        reward={{ xp: 50, cosmeticLabel: "Sunthread scarf" }}
        busy
        onClaim={onClaim}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Claiming reward…" }),
    ).toBeDisabled();
  });

  it("fails safely when no quest is selected and announces errors", () => {
    render(<QuestTracker error="Quest progress is temporarily unavailable." />);

    expect(
      screen.getByText(/explore afterlight to discover/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Quest progress is temporarily unavailable.",
    );
  });
});
