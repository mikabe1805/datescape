import { useId, useState } from "react";

const PANEL_KEYS = ["quest", "relay", "party"];

function validPanel(panel) {
  return PANEL_KEYS.includes(panel) ? panel : "quest";
}

export default function WorldActivityDock({
  questStatus = null,
  relayStatus = null,
  partyStatus = null,
  questContent = null,
  relayContent = null,
  partyContent = null,
  initialPanel = "quest",
}) {
  const dockId = useId();
  const panelId = `${dockId}-activity-panel`;
  const [activePanel, setActivePanel] = useState(() =>
    validPanel(initialPanel),
  );
  const [expanded, setExpanded] = useState(true);
  const panels = [
    {
      key: "quest",
      label: "Quest",
      status: questStatus,
      content: questContent,
    },
    {
      key: "relay",
      label: "Relay",
      status: relayStatus,
      content: relayContent,
    },
    {
      key: "party",
      label: "Party",
      status: partyStatus,
      content: partyContent,
    },
  ];
  const selectedPanel = panels.find((panel) => panel.key === activePanel);

  const selectPanel = (panel) => {
    setActivePanel(panel);
    setExpanded(true);
  };

  return (
    <section
      className={`world-activity-dock is-${activePanel}${expanded ? "" : " is-collapsed"}`}
      aria-label="World activities"
    >
      <header className="world-activity-dock__header">
        <div
          className="world-activity-dock__choices"
          aria-label="Choose an activity"
        >
          {panels.map((panel) => {
            const hasStatus =
              panel.status !== null &&
              panel.status !== undefined &&
              panel.status !== "";

            return (
              <button
                key={panel.key}
                id={`${dockId}-${panel.key}-button`}
                type="button"
                className="world-activity-dock__choice"
                aria-controls={panelId}
                aria-pressed={expanded && activePanel === panel.key}
                onClick={() => selectPanel(panel.key)}
              >
                <span className="world-activity-dock__label">
                  {panel.label}
                </span>
                {hasStatus && (
                  <span className="world-activity-dock__status">
                    {panel.status}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="world-activity-dock__collapse"
          aria-controls={panelId}
          aria-expanded={expanded}
          onClick={() => setExpanded((isExpanded) => !isExpanded)}
        >
          {expanded ? "Hide" : "Show"}
          <span className="world-visually-hidden"> activity details</span>
        </button>
      </header>

      <div
        id={panelId}
        className="world-activity-dock__panel"
        role="region"
        aria-labelledby={`${dockId}-${activePanel}-button`}
        hidden={!expanded}
      >
        {expanded ? selectedPanel?.content : null}
      </div>
    </section>
  );
}
