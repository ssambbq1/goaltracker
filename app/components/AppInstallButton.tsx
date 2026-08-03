"use client";

import { useEffect, useState } from "react";

type AppLanguage = "en" | "ko";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const INSTALL_TEXT = {
  en: {
    install: "Install",
    preparing: "Preparing",
    title: "Install PlanTree",
    iosTitle: "Install on iPhone or iPad",
    iosBody: "Open the Safari share menu, then choose Add to Home Screen.",
    unavailableTitle: "Install is not ready yet",
    unavailableBody: "Keep this page open for a moment, then tap Install again. On desktop Chrome or Edge, you can also use the install icon in the address bar.",
    close: "Close",
  },
  ko: {
    install: "설치",
    preparing: "준비 중",
    title: "플랜트리 설치",
    iosTitle: "iPhone 또는 iPad에 설치",
    iosBody: "Safari 공유 메뉴를 열고 홈 화면에 추가를 선택하세요.",
    unavailableTitle: "설치 준비 중",
    unavailableBody: "잠시 후 설치 버튼을 다시 눌러보세요. 데스크톱 Chrome 또는 Edge에서는 주소창의 설치 아이콘도 사용할 수 있습니다.",
    close: "닫기",
  },
};

function isRunningStandalone() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)
  );
}

function isIosBrowser() {
  if (typeof window === "undefined") return false;

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function AppInstallButton({ language }: { language: AppLanguage }) {
  const text = INSTALL_TEXT[language];
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone());
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpKind, setHelpKind] = useState<"ios" | "unavailable">("unavailable");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => setIsServiceWorkerReady(true))
        .catch(() => setIsServiceWorkerReady(false));
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setIsStandalone(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isStandalone) return null;

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      setInstallPrompt(null);
      setIsStandalone(isRunningStandalone());
      return;
    }

    setHelpKind(isIosBrowser() ? "ios" : "unavailable");
    setShowHelp(true);
  }

  const helpTitle = helpKind === "ios" ? text.iosTitle : text.unavailableTitle;
  const helpBody = helpKind === "ios" ? text.iosBody : text.unavailableBody;
  const buttonText = installPrompt || isIosBrowser() || !isServiceWorkerReady ? text.install : text.preparing;

  return (
    <>
      <button
        type="button"
        onClick={installApp}
        aria-label={text.title}
        title={text.title}
        className="flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-100 sm:h-11"
      >
        <InstallIcon />
        <span className="hidden sm:inline">{buttonText}</span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 px-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
            className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-5 text-stone-950 shadow-xl"
          >
            <h2 id="install-help-title" className="text-lg font-semibold">
              {helpTitle}
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">{helpBody}</p>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {text.close}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function InstallIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
