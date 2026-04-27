let deferredPrompt = null;
let installed =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true);

const listeners = new Set();

function notify() {
  const snapshot = getPwaInstallState();
  listeners.forEach((listener) => listener(snapshot));
}

export function getPwaInstallState() {
  return {
    canInstall: Boolean(deferredPrompt),
    isInstalled: Boolean(installed),
  };
}

export function subscribePwaInstallState(listener) {
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => listeners.delete(listener);
}

export function setupPwaInstallEvents() {
  if (typeof window === "undefined") return () => {};

  const onBeforeInstallPrompt = (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  };

  const onInstalled = () => {
    deferredPrompt = null;
    installed = true;
    notify();
  };

  const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
  const onDisplayModeChange = (event) => {
    installed = Boolean(event.matches || window.navigator?.standalone === true);
    notify();
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);
  mediaQuery?.addEventListener?.("change", onDisplayModeChange);

  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    mediaQuery?.removeEventListener?.("change", onDisplayModeChange);
  };
}

export async function promptForInstall() {
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice?.outcome === "accepted") {
    deferredPrompt = null;
    notify();
    return true;
  }

  return false;
}
