import { fireEvent, render, screen } from "@testing-library/react";
import LanternkeeperExpeditionCard from "./LanternkeeperExpeditionCard";

const expedition = {
  instanceId: "lanternkeeper-expedition:0123456789abcdef0123456789abcdef01234567",
  phase: "market",
  activeMemberCount: 2,
  memberCapacity: 4,
  echoAvailableAt: Date.now() + 90_000,
  expiresAt: Date.now() + 600_000,
  canJoin: true,
};

describe("LanternkeeperExpeditionCard", () => {
  it("keeps start and join explicitly opt-in at Juno's board", () => {
    const onStart = jest.fn();
    const onJoin = jest.fn();
    render(
      <LanternkeeperExpeditionCard
        expeditions={[expedition]}
        expedition={null}
        personal={null}
        signedIn
        atBoard
        onStart={onStart}
        onJoin={onJoin}
      />,
    );

    expect(screen.getByText(/invites, chat, matching, and profile attention never grant xp/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /join route 1, 2 already traveling/i }),
    );
    expect(onJoin).toHaveBeenCalledWith(expedition.instanceId);
    fireEvent.click(
      screen.getByRole("button", { name: "Start an expedition" }),
    );
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the physical route, persistent marks, and penalty-free leave", () => {
    const onContribute = jest.fn();
    const onLeave = jest.fn();
    render(
      <LanternkeeperExpeditionCard
        expeditions={[]}
        expedition={expedition}
        personal={{
          joined: true,
          active: true,
          canLeave: true,
          contributedTargets: ["market-west"],
          availableTargets: ["market-east"],
        }}
        completedTargetIds={["conservatory-scan", "market-west"]}
        currentTargets={["market-west", "market-east"]}
        availableTargetIds={["market-east"]}
        nearbyTargetId="market-east"
        expiresAt={Date.now() + 600_000}
        echoAvailableAt={Date.now() + 90_000}
        signedIn
        onContribute={onContribute}
        onLeave={onLeave}
      />,
    );

    expect(screen.getByText("Light both market lanterns")).toBeInTheDocument();
    expect(screen.getByText("Your mark")).toBeInTheDocument();
    expect(screen.getByText(/current objective:/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Attune East lantern" }),
    );
    expect(onContribute).toHaveBeenCalledWith("market-east");
    fireEvent.click(
      screen.getByRole("button", { name: "Leave without penalty" }),
    );
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("announces only the Echo-ready transition, not its ticking countdown", () => {
    render(
      <LanternkeeperExpeditionCard
        expeditions={[]}
        expedition={{ ...expedition, activeMemberCount: 1 }}
        personal={{
          joined: true,
          active: true,
          canLeave: true,
          contributedTargets: ["market-west"],
          availableTargets: ["market-east"],
        }}
        completedTargetIds={["conservatory-scan", "market-west"]}
        currentTargets={["market-west", "market-east"]}
        availableTargetIds={["market-east"]}
        canUseEcho
        expiresAt={Date.now() + 600_000}
        echoAvailableAt={Date.now() - 1_000}
        signedIn
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/echo guide ready/i);
  });

  it("shows the Echo wait state when a joined companion stalls the paired mark", () => {
    render(
      <LanternkeeperExpeditionCard
        expeditions={[]}
        expedition={expedition}
        personal={{
          joined: true,
          active: true,
          canLeave: true,
          contributedTargets: ["market-west"],
        }}
        completedTargetIds={["conservatory-scan", "market-west"]}
        currentTargets={["market-west", "market-east"]}
        availableTargetIds={[]}
        expiresAt={Date.now() + 600_000}
        echoAvailableAt={Date.now() + 90_000}
        signedIn
      />,
    );

    expect(screen.getByText(/waiting for the other field mark/i)).toBeInTheDocument();
    expect(screen.queryByText(/follow the gold trail/i)).not.toBeInTheDocument();
  });

  it("does not re-enroll a leaver or offer an expired board route", () => {
    const openRoute = {
      ...expedition,
      instanceId:
        "lanternkeeper-expedition:1123456789abcdef0123456789abcdef01234567",
      expiresAt: Date.now() + 60_000,
    };
    const expiredRoute = {
      ...expedition,
      instanceId:
        "lanternkeeper-expedition:2123456789abcdef0123456789abcdef01234567",
      expiresAt: Date.now() - 1,
    };
    render(
      <LanternkeeperExpeditionCard
        expeditions={[openRoute, expiredRoute]}
        expedition={{ ...expedition, phase: "completed" }}
        personal={{ joined: true, active: false, canLeave: false }}
        signedIn
        atBoard
      />,
    );

    expect(screen.queryByText(/return to juno to claim/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /join route/i })).toHaveLength(1);
  });

  it("lets a credited finisher join another open route", () => {
    const openRoute = {
      ...expedition,
      instanceId:
        "lanternkeeper-expedition:3123456789abcdef0123456789abcdef01234567",
      expiresAt: Date.now() + 60_000,
    };
    render(
      <LanternkeeperExpeditionCard
        expeditions={[openRoute]}
        expedition={{ ...expedition, phase: "completed" }}
        personal={{ joined: true, active: true, canLeave: false }}
        completedTargetIds={[
          "conservatory-scan",
          "market-west",
          "market-east",
          "resonance-left",
          "resonance-right",
        ]}
        currentTargets={[]}
        signedIn
        atBoard
      />,
    );

    expect(screen.getByText(/if you carried juno's contract/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join route 1/i })).toBeEnabled();
    expect(screen.getAllByText(/completed objective:/i)).toHaveLength(5);
  });

  it("shows claim copy only when the quest receipt is ready", () => {
    render(
      <LanternkeeperExpeditionCard
        expeditions={[]}
        expedition={{ ...expedition, phase: "completed" }}
        personal={{ joined: true, active: true, canLeave: false }}
        completedTargetIds={[
          "conservatory-scan",
          "market-west",
          "market-east",
          "resonance-left",
          "resonance-right",
        ]}
        rewardReady
        signedIn
        atBoard
      />,
    );

    expect(screen.getByText(/return to juno to claim quest xp/i)).toBeInTheDocument();
  });
});
