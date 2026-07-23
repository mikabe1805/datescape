import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChessGame from "./ChessGame";

function multiplayer(overrides = {}) {
  return {
    myUid: "white",
    matchId: "match-1",
    whiteUid: "white",
    blackUid: "black",
    whiteName: "Ari",
    blackName: "Bea",
    moves: [],
    submitMove: jest.fn().mockResolvedValue({ ok: true, accepted: true }),
    ...overrides,
  };
}

describe("ChessGame authority boundaries", () => {
  it("renders packaged chess icons and waits for the server move log", async () => {
    let resolveSubmission;
    const submitMove = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    const initialMultiplayer = multiplayer({ submitMove });
    const { container, rerender } = render(
      <ChessGame
        multiplayer={initialMultiplayer}
        onClose={jest.fn()}
        onResult={jest.fn()}
      />,
    );

    const e2 = screen.getByRole("button", { name: "e2, white pawn" });
    const e4 = screen.getByRole("button", { name: "e4, empty" });
    expect(e2.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toMatch(/[♔-♟]/);

    fireEvent.click(e2);
    fireEvent.click(e4);
    expect(submitMove).toHaveBeenCalledWith({
      from: "e2",
      to: "e4",
      promotion: "q",
    });
    expect(e2.querySelector("svg")).not.toBeNull();
    expect(e4.querySelector("svg")).toBeNull();

    resolveSubmission({ ok: true, accepted: true });
    await waitFor(() =>
      expect(screen.getByText("Move accepted. Syncing the board…")).toBeVisible(),
    );

    rerender(
      <ChessGame
        multiplayer={{
          ...initialMultiplayer,
          moves: [{ ply: 1, san: "e4", by: "white", at: 100 }],
        }}
        onClose={jest.fn()}
        onResult={jest.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "e4, white pawn" }).querySelector(
          "svg",
        ),
      ).not.toBeNull(),
    );
  });

  it("keeps NPC chess local", () => {
    render(<ChessGame npcName="Mira" onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "e2, white pawn" }));
    fireEvent.click(screen.getByRole("button", { name: "e4, empty" }));
    expect(
      screen.getByRole("button", { name: "e4, white pawn" }).querySelector(
        "svg",
      ),
    ).not.toBeNull();
  });
});
