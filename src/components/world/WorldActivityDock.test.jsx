import { fireEvent, render, screen, within } from "@testing-library/react";
import WorldActivityDock from "./WorldActivityDock";

function renderDock(props = {}) {
  return render(
    <WorldActivityDock
      questStatus="2 of 4"
      relayStatus="3 lights"
      partyStatus="2 nearby"
      questContent={<p>Quest trail</p>}
      relayContent={<p>Relay route</p>}
      partyContent={<p>Party route</p>}
      {...props}
    />,
  );
}

describe("WorldActivityDock", () => {
  it("opens the requested initial panel and exposes concise activity statuses", () => {
    renderDock({ initialPanel: "relay" });

    const dock = screen.getByRole("region", { name: "World activities" });
    expect(within(dock).getByRole("button", { name: /quest/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(dock).getByRole("button", { name: /relay/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dock).getByText("2 of 4")).toBeInTheDocument();
    expect(within(dock).getByText("3 lights")).toBeInTheDocument();
    expect(within(dock).getByText("2 nearby")).toBeInTheDocument();
    expect(within(dock).getByText("Relay route")).toBeInTheDocument();
    expect(within(dock).queryByText("Quest trail")).not.toBeInTheDocument();
    expect(within(dock).queryByText("Party route")).not.toBeInTheDocument();
  });

  it("switches the single visible panel with native pressed buttons", () => {
    renderDock();

    const questButton = screen.getByRole("button", { name: /quest/i });
    const partyButton = screen.getByRole("button", { name: /party/i });

    expect(questButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(partyButton);

    expect(questButton).toHaveAttribute("aria-pressed", "false");
    expect(partyButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: /party/i })).toHaveTextContent(
      "Party route",
    );
    expect(screen.queryByText("Quest trail")).not.toBeInTheDocument();
    expect(screen.queryByText("Relay route")).not.toBeInTheDocument();
  });

  it("collapses activity details and restores the selected panel", () => {
    renderDock({ initialPanel: "party" });

    const hideButton = screen.getByRole("button", {
      name: "Hide activity details",
    });
    fireEvent.click(hideButton);

    expect(
      screen.getByRole("button", { name: "Show activity details" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Party route")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /party/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show activity details" }),
    );

    expect(screen.getByText("Party route")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /party/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
