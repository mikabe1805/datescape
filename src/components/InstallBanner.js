import React from "react";
import { Download, Share2, X } from "lucide-react";
import {
  getPwaInstallState,
  promptForInstall,
  subscribePwaInstallState
} from "../utils/pwaInstall";

export default function InstallBanner() {
  const [installState, setInstallState] = React.useState(getPwaInstallState());
  const [collapsed, setCollapsed] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [showSteps, setShowSteps] = React.useState(false);

  React.useEffect(() => subscribePwaInstallState(setInstallState), []);

  React.useEffect(() => {
    if (installState.isInstalled) {
      setDismissed(true);
    }
  }, [installState.isInstalled]);

  if (dismissed || installState.isInstalled) return null;
  if (!installState.canInstall && !installState.needsManualInstall) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="install-banner install-banner--compact"
        onClick={() => setCollapsed(false)}
        aria-label="Open install app prompt"
      >
        {installState.needsManualInstall ? <Share2 size={16} /> : <Download size={16} />}
        <span>Install app</span>
      </button>
    );
  }

  const handleInstall = async () => {
    setWorking(true);
    try {
      await promptForInstall();
    } finally {
      setWorking(false);
    }
  };

  const toggleSteps = () => {
    setShowSteps((prev) => !prev);
  };

  return (
    <div className="install-banner">
      <div className="install-banner__copy">
        <div className="install-banner__icon">
          {installState.needsManualInstall ? <Share2 size={18} /> : <Download size={18} />}
        </div>
        <div>
          <p className="install-banner__eyebrow">Install DateScape</p>
          <p className="install-banner__text">
            {installState.needsManualInstall
              ? installState.isSafari
                ? "On iPhone Safari, open Share and choose Add to Home Screen."
                : "On iPhone, open this site in Safari and then use Share > Add to Home Screen."
              : "Install the app for a full-screen, home-screen version."}
          </p>
          {installState.needsManualInstall && showSteps && (
            <ol className="install-banner__steps">
              <li>Open the share menu in the browser.</li>
              <li>Select <strong>Add to Home Screen</strong>.</li>
              <li>Confirm the app name and save it.</li>
            </ol>
          )}
        </div>
      </div>

      <div className="install-banner__actions">
        {installState.canInstall ? (
          <button className="install-banner__button install-banner__button--primary" onClick={handleInstall} disabled={working}>
            {working ? "Opening..." : "Install"}
          </button>
        ) : (
          <button className="install-banner__button" type="button" onClick={toggleSteps}>
            {showSteps ? "Hide steps" : "Show steps"}
          </button>
        )}
        <button className="install-banner__close" onClick={() => setDismissed(true)} aria-label="Dismiss install banner">
          <X size={16} />
        </button>
        <button className="install-banner__close" onClick={() => setCollapsed(true)} aria-label="Minimize install banner">
          <span aria-hidden="true">-</span>
        </button>
      </div>
    </div>
  );
}
