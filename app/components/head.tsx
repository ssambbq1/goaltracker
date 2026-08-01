"use client";

import Image from "next/image";
import appIcon from "../icon3.png";
import AppInstallButton from "./AppInstallButton";

type AppLanguage = "en" | "ko";

type HeadText = {
  appName: string;
  tagline: string;
  languageToggle: string;
  languageTitle: string;
};

type HeadProps = {
  language: AppLanguage;
  text: HeadText;
  isDarkMode: boolean;
  isUserView: boolean;
  onLanguageToggle: () => void;
  onThemeToggle: () => void;
  onUserOpen: () => void;
};

export default function Head({
  language,
  text,
  isDarkMode,
  isUserView,
  onLanguageToggle,
  onThemeToggle,
  onUserOpen,
}: HeadProps) {
  return (
    <header className="flex items-end justify-between gap-2 border-b border-stone-300 pb-6 sm:gap-4">
      <div className="flex min-w-0 items-end gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-emerald-700">{text.tagline}</p>
          <h1 className="mt-2 block max-w-full whitespace-nowrap bg-gradient-to-r from-emerald-700 via-stone-900 to-amber-500 bg-clip-text text-[clamp(1.65rem,8vw,2.25rem)] font-bold leading-none text-transparent drop-shadow-sm sm:text-5xl lg:text-6xl">
            {text.appName}
          </h1>
        </div>
        <AppleTreeIcon />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <AppInstallButton language={language} />
        <button
          type="button"
          onClick={onLanguageToggle}
          aria-label={text.languageTitle}
          title={text.languageTitle}
          className="flex h-9 min-w-12 items-center justify-center rounded-full border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-100 sm:h-11"
        >
          {text.languageToggle}
        </button>
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={isDarkMode ? "Light mode" : "Dark mode"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-100 sm:h-11 sm:w-11"
        >
          {isDarkMode ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          onClick={onUserOpen}
          aria-label="Open user page"
          className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition sm:h-11 sm:w-11 ${
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
    <Image
      src={appIcon}
      alt=""
      aria-hidden="true"
      className="h-10 w-10 shrink-0 object-contain drop-shadow-sm sm:h-16 sm:w-16"
      priority
    />
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
