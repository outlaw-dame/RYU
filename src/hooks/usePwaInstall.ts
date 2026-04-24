import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function usePwaInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("ryu.install.dismissed") === "1");
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const handler = (incoming: Event) => {
      incoming.preventDefault();
      setEvent(incoming as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const prompt = useCallback(async () => {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    return choice.outcome === "accepted";
  }, [event]);

  const dismiss = useCallback(() => {
    localStorage.setItem("ryu.install.dismissed", "1");
    setDismissed(true);
  }, []);

  return { isInstalled, isIos, canPrompt: Boolean(event) && !dismissed && !isInstalled, isDismissed: dismissed, prompt, dismiss };
}
