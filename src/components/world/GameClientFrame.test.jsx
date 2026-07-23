import { act, render, screen, waitFor } from "@testing-library/react";
import GameClientFrame from "./GameClientFrame";

const envelope = (type, payload) => ({
  scope: "datescape-world",
  version: 2,
  type,
  payload,
});

function sendFromGame(frame, type, payload, origin = window.location.origin) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: envelope(type, payload),
      origin,
      source: frame.contentWindow,
    }),
  );
}

describe("GameClientFrame audio bridge", () => {
  it("publishes only the validated public activity phase and clears it with null", async () => {
    const baseProps = {
      profile: { name: "Ari", color: "#75d8d0", intent: "solo" },
      remotePlayers: [],
      journeyState: null,
      audioEnabled: false,
      paused: false,
    };
    const { rerender } = render(
      <GameClientFrame
        {...baseProps}
        activityState={{
          id: "listening-crescent",
          active: true,
          slot: 1,
          phase: "waiting",
          partnerUid: "private-partner-id",
          prompt: "private prompt",
        }}
      />,
    );

    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("ACTIVITY_STATE", {
          id: "listening-crescent",
          active: true,
          slot: 1,
          phase: "waiting",
        }),
        window.location.origin,
      ),
    );

    for (const phase of ["playing", "resolved"]) {
      rerender(
        <GameClientFrame
          {...baseProps}
          activityState={{
            id: "resonance-duet",
            active: true,
            slot: 0,
            phase,
          }}
        />,
      );
      await waitFor(() =>
        expect(postMessage).toHaveBeenCalledWith(
          envelope("ACTIVITY_STATE", {
            id: "resonance-duet",
            active: true,
            slot: 0,
            phase,
          }),
          window.location.origin,
        ),
      );
    }

    rerender(<GameClientFrame {...baseProps} activityState={null} />);
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("ACTIVITY_STATE", null),
        window.location.origin,
      ),
    );
  });

  it("clears malformed activity state instead of forwarding it", async () => {
    render(
      <GameClientFrame
        profile={{ name: "Ari", color: "#75d8d0", intent: "solo" }}
        remotePlayers={[]}
        activityState={{
          id: "resonance-duet",
          active: true,
          slot: 0,
          phase: "connecting",
        }}
        journeyState={null}
        audioEnabled={false}
        paused={false}
      />,
    );

    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("ACTIVITY_STATE", null),
        window.location.origin,
      ),
    );
    expect(
      postMessage.mock.calls.some(
        ([message]) =>
          message.type === "ACTIVITY_STATE" &&
          message.payload?.phase === "connecting",
      ),
    ).toBe(false);
  });

  it("sends the persisted preference and accepts only valid same-frame audio states", async () => {
    const onAudioStateChange = jest.fn();
    render(
      <GameClientFrame
        profile={{ name: "Ari", color: "#75d8d0", intent: "solo" }}
        remotePlayers={[]}
        activityState={null}
        journeyState={{
          id: "night-7",
          visited: ["market", "unknown", "market", "resonance"],
          stage: "moment",
          complete: false,
        }}
        audioEnabled={false}
        paused={false}
        onAudioStateChange={onAudioStateChange}
      />,
    );

    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});

    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("AUDIO_SETTINGS", { enabled: false }),
        window.location.origin,
      ),
    );
    expect(postMessage).toHaveBeenCalledWith(
      envelope("JOURNEY_STATE", {
        id: "night-7",
        visited: ["market", "resonance"],
        stage: "moment",
        complete: false,
      }),
      window.location.origin,
    );

    act(() => sendFromGame(frame, "AUDIO_STATE", { state: "running" }));
    expect(onAudioStateChange).toHaveBeenCalledWith("running");

    act(() => sendFromGame(frame, "AUDIO_STATE", { state: "invented" }));
    act(() =>
      sendFromGame(
        frame,
        "AUDIO_STATE",
        { state: "muted" },
        "https://untrusted.example",
      ),
    );
    expect(onAudioStateChange).toHaveBeenCalledTimes(1);
  });

  it("does not send a journey whose completion flag contradicts its stage", async () => {
    render(
      <GameClientFrame
        profile={{ name: "Ari", color: "#75d8d0", intent: "solo" }}
        remotePlayers={[]}
        activityState={null}
        journeyState={{
          id: "night-invalid",
          visited: ["market"],
          stage: "complete",
          complete: false,
        }}
        audioEnabled={false}
        paused={false}
      />,
    );

    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "BOOT" }),
        window.location.origin,
      ),
    );
    expect(
      postMessage.mock.calls.some(([message]) => message.type === "JOURNEY_STATE"),
    ).toBe(false);
  });
});

describe("GameClientFrame Lanternkeeper bridge", () => {
  const baseProps = {
    profile: { name: "Ari", color: "#75d8d0", intent: "solo" },
    remotePlayers: [],
    activityState: null,
    journeyState: null,
    audioEnabled: false,
    paused: false,
  };

  it("publishes only the bounded expedition projection and replays it on READY", async () => {
    render(
      <GameClientFrame
        {...baseProps}
        expeditionState={{
          id: "lanternkeeper-expedition",
          instanceId: "lanternkeeper:route-1",
          revision: 7,
          status: "active",
          stageId: "market-lanterns",
          memberCount: 2,
          maxMembers: 4,
          expiresAt: 50_000,
          echoAvailableAt: 10_000,
          resultMode: null,
          completedTargetIds: [
            "conservatory-scan",
            "market-west",
            "private-target",
          ],
          personal: {
            joined: true,
            completedTargetIds: ["market-west", "private-target"],
            availableTargetIds: ["market-east", "private-target"],
            canUseEcho: false,
            uid: "private-uid",
          },
          serverNow: 12_000,
          members: ["private-uid"],
        }}
      />,
    );
    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});

    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("EXPEDITION_STATE", {
          id: "lanternkeeper-expedition",
          instanceId: "lanternkeeper:route-1",
          revision: 7,
          status: "active",
          stageId: "market-lanterns",
          memberCount: 2,
          maxMembers: 4,
          expiresAt: 50_000,
          echoAvailableAt: 10_000,
          resultMode: null,
          completedTargetIds: ["conservatory-scan", "market-west"],
          personal: {
            joined: true,
            completedTargetIds: ["market-west"],
            availableTargetIds: ["market-east"],
            canUseEcho: false,
          },
          serverNow: 12_000,
        }),
        window.location.origin,
      ),
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toMatch(
      /private-uid|private-target|members/,
    );
  });

  it("accepts only valid contextual expedition actions and target changes", () => {
    const onActionRequest = jest.fn();
    const onExpeditionTargetChange = jest.fn();
    render(
      <GameClientFrame
        {...baseProps}
        onActionRequest={onActionRequest}
        onExpeditionTargetChange={onExpeditionTargetChange}
      />,
    );
    const frame = screen.getByTitle("Afterlight game world");

    act(() =>
      sendFromGame(frame, "ACTION_REQUESTED", {
        action: "expedition-contribute",
        target: {
          kind: "expedition",
          instanceId: "lanternkeeper:route-1",
          targetId: "market-east",
        },
      }),
    );
    expect(onActionRequest).toHaveBeenCalledWith({
      action: "expedition-contribute",
      target: {
        kind: "expedition",
        instanceId: "lanternkeeper:route-1",
        targetId: "market-east",
      },
    });

    act(() =>
      sendFromGame(frame, "EXPEDITION_TARGET_CHANGED", {
        instanceId: "lanternkeeper:route-1",
        targetId: "market-east",
      }),
    );
    act(() =>
      sendFromGame(frame, "EXPEDITION_TARGET_CHANGED", {
        instanceId: null,
        targetId: null,
      }),
    );
    expect(onExpeditionTargetChange).toHaveBeenNthCalledWith(1, {
      instanceId: "lanternkeeper:route-1",
      targetId: "market-east",
    });
    expect(onExpeditionTargetChange).toHaveBeenNthCalledWith(2, {
      instanceId: null,
      targetId: null,
    });

    act(() =>
      sendFromGame(frame, "ACTION_REQUESTED", {
        action: "expedition-contribute",
        target: {
          kind: "expedition",
          instanceId: "lanternkeeper:route-1",
          targetId: "admin-target",
        },
      }),
    );
    expect(onActionRequest).toHaveBeenCalledTimes(1);
  });
});

describe("GameClientFrame RPG presentation bridge", () => {
  const appearance = {
    v: 1,
    frame: "broad",
    skinTone: "deep-umber",
    hairStyle: "asymmetric-bob",
    hairColor: "copper",
    outfit: {
      base: "promenade-v1",
      palette: "garden-glass",
      trim: "sunthread",
      inventory: ["private"],
    },
    accessory: "none",
    unlockedCosmetics: ["private"],
  };

  it("boots and live-updates only equipped appearance catalog ids", async () => {
    const baseProps = {
      profile: {
        name: "Ari",
        color: "#75d8d0",
        intent: "solo",
        appearance,
        xp: 9000,
        inventory: ["private"],
      },
      remotePlayers: [
        {
          uid: "remote-1",
          name: "Bo",
          color: "#f19bb8",
          intent: "friends",
          appearance: { ...appearance, frame: "narrow", quest: "private" },
          x: 2,
          z: 3,
          xp: 500,
        },
      ],
      activityState: null,
      journeyState: null,
      questState: null,
      audioEnabled: false,
      paused: false,
    };
    const { rerender } = render(<GameClientFrame {...baseProps} />);
    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});

    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope(
          "AVATAR_UPDATED",
          expect.objectContaining({
            color: "#75d8d0",
            appearance: expect.objectContaining({
              frame: "broad",
              skinTone: "deep-umber",
              hairColor: "copper",
              accessory: "none",
            }),
          }),
        ),
        window.location.origin,
      ),
    );

    const boot = postMessage.mock.calls.find(
      ([message]) => message.type === "BOOT",
    )?.[0];
    expect(boot.payload.player.appearance.outfit).toEqual({
      base: "promenade-v1",
      palette: "garden-glass",
      trim: "sunthread",
    });
    expect(JSON.stringify(boot)).not.toMatch(
      /inventory|unlockedCosmetics|quest|xp/,
    );

    rerender(
      <GameClientFrame
        {...baseProps}
        profile={{
          ...baseProps.profile,
          appearance: { ...appearance, hairColor: "espresso" },
        }}
      />,
    );
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope(
          "AVATAR_UPDATED",
          expect.objectContaining({
            appearance: expect.objectContaining({ hairColor: "espresso" }),
          }),
        ),
        window.location.origin,
      ),
    );
  });

  it("forwards only a bounded active quest target and clears malformed state", async () => {
    const baseProps = {
      profile: { name: "Ari", color: "#75d8d0", intent: "solo", appearance },
      remotePlayers: [],
      activityState: null,
      journeyState: null,
      audioEnabled: false,
      paused: false,
    };
    const { rerender } = render(
      <GameClientFrame
        {...baseProps}
        questState={{
          questId: "afterlight-sunthread",
          nodeId: "recover-rain-prism",
          targetLandmarkId: "conservatory",
          status: "active",
          inventory: ["private"],
        }}
      />,
    );
    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("QUEST_STATE", {
          questId: "afterlight-sunthread",
          nodeId: "recover-rain-prism",
          targetLandmarkId: "conservatory",
          status: "active",
        }),
        window.location.origin,
      ),
    );

    rerender(
      <GameClientFrame
        {...baseProps}
        questState={{
          questId: "afterlight-sunthread",
          nodeId: "hack",
          targetLandmarkId: "private-room",
          status: "completed",
        }}
      />,
    );
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("QUEST_STATE", null),
        window.location.origin,
      ),
    );
  });

  it("forwards only aggregate Rainlight state and clears an idle cycle", async () => {
    const baseProps = {
      profile: { name: "Ari", color: "#75d8d0", intent: "solo", appearance },
      remotePlayers: [],
      activityState: null,
      journeyState: null,
      questState: null,
      audioEnabled: false,
      paused: false,
    };
    const publicEventState = {
      id: "rainlight-relay",
      instanceId: "rainlight:cycle-1",
      phase: "gathering",
      startedAt: 1_000,
      echoAvailableAt: 91_000,
      completedAt: null,
      cooldownEndsAt: null,
      contributionCount: 2,
      targetCount: 4,
      contributorCount: 2,
      sourceCount: 2,
      sourceCounts: { conservatory: 1, market: 1, resonance: 0 },
      resultMode: null,
      contributors: ["private-uid"],
    };
    const { rerender } = render(
      <GameClientFrame {...baseProps} publicEventState={publicEventState} />,
    );
    const frame = screen.getByTitle("Afterlight game world");
    const postMessage = jest
      .spyOn(frame.contentWindow, "postMessage")
      .mockImplementation(() => {});
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("PUBLIC_EVENT_STATE", {
          id: "rainlight-relay",
          instanceId: "rainlight:cycle-1",
          phase: "gathering",
          startedAt: 1_000,
          echoAvailableAt: 91_000,
          completedAt: null,
          cooldownEndsAt: null,
          contributionCount: 2,
          targetCount: 4,
          contributorCount: 2,
          sourceCount: 2,
          sourceCounts: { conservatory: 1, market: 1, resonance: 0 },
          resultMode: null,
        }),
        window.location.origin,
      ),
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toMatch(/private-uid/);

    postMessage.mockClear();
    act(() => sendFromGame(frame, "READY", { renderer: "playcanvas-2" }));
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope(
          "PUBLIC_EVENT_STATE",
          expect.objectContaining({
            instanceId: "rainlight:cycle-1",
            phase: "gathering",
          }),
        ),
        window.location.origin,
      ),
    );

    rerender(
      <GameClientFrame
        {...baseProps}
        publicEventState={{ ...publicEventState, instanceId: null, phase: "idle" }}
      />,
    );
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        envelope("PUBLIC_EVENT_STATE", null),
        window.location.origin,
      ),
    );
  });
});
