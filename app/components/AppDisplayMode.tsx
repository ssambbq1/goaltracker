"use client";

import { useEffect } from "react";

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as StandaloneNavigator).standalone === true
  );
}

export default function AppDisplayMode() {
  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const fullscreenQuery = window.matchMedia("(display-mode: fullscreen)");

    function updateDisplayModeClass() {
      const isStandalone = isStandaloneDisplay();
      document.documentElement.classList.toggle("pwa-standalone", isStandalone);
      document.body.classList.toggle("pwa-standalone", isStandalone);
    }

    updateDisplayModeClass();
    standaloneQuery.addEventListener("change", updateDisplayModeClass);
    fullscreenQuery.addEventListener("change", updateDisplayModeClass);

    return () => {
      standaloneQuery.removeEventListener("change", updateDisplayModeClass);
      fullscreenQuery.removeEventListener("change", updateDisplayModeClass);
    };
  }, []);

  return null;
}
