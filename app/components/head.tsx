"use client";

import Image from "next/image";
import { useState } from "react";
import appIcon from "../icon3.png";
import AppInstallButton from "./AppInstallButton";

type AppLanguage = "en" | "ko";

type HeadText = {
  appName: string;
  tagline: string;
};

type HeadProps = {
  language: AppLanguage;
  text: HeadText;
  isDarkMode: boolean;
  isUserView: boolean;
  onLanguageChange: (language: AppLanguage) => void;
  onHomeOpen: () => void;
  onThemeToggle: () => void;
  onUserOpen: () => void;
};

export default function Head({
  language,
  text,
  isDarkMode,
  isUserView,
  onLanguageChange,
  onHomeOpen,
  onThemeToggle,
  onUserOpen,
}: HeadProps) {
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  function chooseLanguage(nextLanguage: AppLanguage) {
    onLanguageChange(nextLanguage);
    setIsLanguageMenuOpen(false);
  }

  return (
    <header className="flex items-end justify-between gap-2 border-b border-stone-300 pb-5 sm:gap-4 sm:pb-6">
      <button
        type="button"
        onClick={onHomeOpen}
        className="flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:gap-3.5"
        aria-label={language === "ko" ? "목표 리스트로 이동" : "Go to goal list"}
      >
        <AppleTreeIcon />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 sm:text-sm">{text.tagline}</p>
          <h1 className="plantree-wordmark mt-1 block max-w-full whitespace-nowrap bg-gradient-to-r from-emerald-800 via-stone-950 to-teal-700 bg-clip-text text-[clamp(1.85rem,8vw,2.65rem)] font-semibold leading-[0.95] text-transparent sm:text-5xl lg:text-6xl">
            {text.appName}
          </h1>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <AppInstallButton language={language} />
        <div
          className="relative"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsLanguageMenuOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => setIsLanguageMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
            aria-label="Select language"
            className="flex h-8 min-w-12 items-center justify-center rounded-md border border-stone-300 bg-white px-2 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-100 sm:h-10 sm:px-3"
          >
            Lang
          </button>
          {isLanguageMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 min-w-28 overflow-hidden rounded-md border border-stone-300 bg-white py-1 text-xs font-semibold text-stone-700 shadow-lg"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === "ko"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseLanguage("ko")}
                className={`block w-full px-3 py-2 text-left hover:bg-stone-100 ${
                  language === "ko" ? "bg-emerald-50 text-emerald-800" : ""
                }`}
              >
                Korean
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === "en"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseLanguage("en")}
                className={`block w-full px-3 py-2 text-left hover:bg-stone-100 ${
                  language === "en" ? "bg-emerald-50 text-emerald-800" : ""
                }`}
              >
                English
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={isDarkMode ? "Light mode" : "Dark mode"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-100 sm:h-10 sm:w-10"
        >
          {isDarkMode ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          onClick={onUserOpen}
          aria-label="Open user page"
          className={`flex h-8 w-8 items-center justify-center rounded-md border shadow-sm transition sm:h-10 sm:w-10 ${
            isUserView
              ? "border-emerald-700 bg-emerald-700 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
        >
          <UserIcon />
        </button>
      </div>
    </header>
  );
}

function AppleTreeIcon() {
  return (
    <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg drop-shadow-sm sm:h-20 sm:w-20">
      <Image
        src={appIcon}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
        priority
      />
    </span>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a7 7 0 1 0 11 11Z" />
    </svg>
  );
}
