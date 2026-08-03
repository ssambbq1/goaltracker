"use client";

import Image from "next/image";
import bestIcon from "../BEST-transparent.png";
import youIcon from "../YOU-transparent.png";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import AppInstallButton from "./AppInstallButton";
import Head from "./head";
import ProgressChart from "./ProgressChart";
import RoutineTracker from "./RoutineTracker";

type ProgressEntry = {
  id: string;
  createdAt: number;
  value: number;
  memo: string;
};

type Goal = {
  id: string;
  title: string;
  memo: string;
  target: number;
  unit: string;
  deadline: string;
  createdAt: number;
  deletedAt?: number;
  archivedAt?: number;
  entries: ProgressEntry[];
};

type GoalPatch = Partial<Pick<Goal, "title" | "memo" | "target" | "unit" | "deadline" | "createdAt">>;

type GoalDraft = {
  goalId: string;
  title: string;
  memo: string;
  target: string;
  unit: string;
  startDate: string;
  deadline: string;
};

type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  targetDate?: string;
  category: string;
  deletedAt?: number;
  archivedAt?: number;
};

type RoutineSummary = {
  id: string;
  title: string;
  memo: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  deletedAt?: number;
  archivedAt?: number;
};

type TrackerView = "list" | "todo" | "routine" | "archive" | "bin" | "detail" | "user";
type AppLanguage = "en" | "ko";

type Session = {
  loginId: string | null;
};

type NavigationState = {
  boostMastery: true;
  view: TrackerView;
  goalId: string | null;
};

type NavDragState = {
  pointerId: number;
  startX: number;
  scrollLeft: number;
  didMove: boolean;
};

type ScreenSwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  didSwipe: boolean;
};

type ConfettiParticle = {
  id: string;
  left: number;
  size: number;
  x: number;
  rotate: number;
  delay: number;
  duration: number;
  color: string;
};

const emptyGoalForm = {
  title: "",
  memo: "",
  target: 100,
  unit: "units",
  startDate: toDateInputValue(),
  deadline: "",
};

const NAVIGATION_STORAGE_KEY = "boost-mastery.navigation";
const THEME_STORAGE_KEY = "boost-mastery.theme";
const LANGUAGE_STORAGE_KEY = "boost-mastery.language";
const SWIPE_NAVIGATION_ORDER: TrackerView[] = ["list", "todo", "routine", "archive", "bin"];
const SWIPE_MIN_DISTANCE = 72;
const SWIPE_MAX_VERTICAL_DRIFT = 56;
const confettiColors = ["#047857", "#f59e0b", "#ef4444", "#0ea5e9", "#84cc16"];

const UI_TEXT = {
  en: {
    appName: "PlanTree",
    tagline: "Design your life",
    languageToggle: "Kor",
    languageTitle: "Switch to Korean",
    goalList: "Goal list",
    goalShort: "Goals",
    todoList: "To do list",
    todoShort: "To do",
    routineList: "Routine",
    routineShort: "Routine",
    archive: "Archive",
    bin: "Bin",
    goalDetail: "Goal detail",
    user: "User",
    add: "ADD+",
    save: "SAVE",
    saveTitle: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    edit: "Edit",
    empty: "EMPTY",
    emptyBin: "Empty bin",
    restore: "Restore",
    moveToBin: "Move to bin",
    deleteForever: "Delete forever",
    all: "All",
    category: "Category",
    noCategory: "No category",
    target: "Target",
    targetDate: "Target date",
    progress: "Progress",
    current: "Current",
    unit: "Unit",
    memo: "Memo",
    start: "Start",
    deadline: "Deadline",
    latest: "Latest",
    none: "none",
    notSet: "not set",
    progressChart: "Progress chart",
    progressChartHint: "Records are plotted by saved date.",
    recordHistory: "Record history",
    addGoal: "Add goal",
    addTodo: "Add todo",
    addProgressRecord: "Add progress record",
    goalName: "Goal name",
    goalMemo: "Goal memo",
    todo: "Todo",
    noGoals: "No goals yet. Add the first goal to start tracking.",
    noTodos: "No todos yet. Add a simple task to keep it on the list.",
    noTodosForCategory: "No todos match the selected categories.",
    noProgress: "No progress records yet. Add a record to draw the chart.",
    noRecords: "No records yet. Saved records will be written with their date.",
    noMemo: "No memo",
    archived: "Archived",
    deleted: "Deleted",
    unknown: "unknown",
    archivedEmpty: "Archived items will appear here.",
    deletedEmpty: "Deleted items will appear here.",
    completed: "Completed",
    notCompleted: "Not completed",
    lastProgress: "Last progress",
    emptyBinTitle: "Empty bin?",
    emptyBinConfirm: (count: number) => `Delete ${count} item${count === 1 ? "" : "s"} forever. This cannot be undone.`,
  },
  ko: {
    appName: "플랜트리",
    tagline: "삶을 설계하세요",
    languageToggle: "Eng",
    languageTitle: "영어로 전환",
    goalList: "장기목표",
    goalShort: "목표",
    todoList: "단순 할일",
    todoShort: "할일",
    routineList: "습관",
    routineShort: "습관",
    archive: "저장소",
    bin: "휴지통",
    goalDetail: "목표 상세",
    user: "사용자",
    add: "추가+",
    save: "저장",
    saveTitle: "저장",
    cancel: "취소",
    close: "닫기",
    delete: "삭제",
    edit: "수정",
    empty: "비우기",
    emptyBin: "휴지통 비우기",
    restore: "복원",
    moveToBin: "휴지통으로 이동",
    deleteForever: "영구 삭제",
    all: "전체",
    category: "카테고리",
    noCategory: "카테고리 없음",
    target: "목표",
    targetDate: "목표일",
    progress: "진행률",
    current: "현재",
    unit: "단위",
    memo: "메모",
    start: "시작",
    deadline: "마감",
    latest: "최근",
    none: "없음",
    notSet: "미설정",
    progressChart: "진행 그래프",
    progressChartHint: "저장한 날짜 기준으로 기록이 표시됩니다.",
    recordHistory: "기록 내역",
    addGoal: "목표 추가",
    addTodo: "할일 추가",
    addProgressRecord: "진행 기록 추가",
    goalName: "목표 이름",
    goalMemo: "목표 메모",
    todo: "할일",
    noGoals: "아직 목표가 없습니다. 첫 목표를 추가해 추적을 시작하세요.",
    noTodos: "아직 할일이 없습니다. 단순 할일을 추가하세요.",
    noTodosForCategory: "선택한 카테고리에 해당하는 할일이 없습니다.",
    noProgress: "아직 진행 기록이 없습니다. 기록을 추가하면 그래프가 표시됩니다.",
    noRecords: "아직 기록이 없습니다. 저장한 기록은 날짜와 함께 표시됩니다.",
    noMemo: "메모 없음",
    archived: "저장됨",
    deleted: "삭제됨",
    unknown: "알 수 없음",
    archivedEmpty: "저장한 항목이 여기에 표시됩니다.",
    deletedEmpty: "삭제한 항목이 여기에 표시됩니다.",
    completed: "완료",
    notCompleted: "미완료",
    lastProgress: "최근 진행",
    emptyBinTitle: "휴지통을 비울까요?",
    emptyBinConfirm: (count: number) => `${count}개 항목을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`,
  },
} as const;

async function fetchSession() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load session");
  return (await response.json()) as Session;
}

async function login(loginId: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password }),
  });
  const data = (await response.json()) as { error?: string; loginId?: string };
  if (!response.ok || !data.loginId) throw new Error(data.error || "Failed to login");
  return data.loginId;
}

async function signup(loginId: string, password: string) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password }),
  });
  const data = (await response.json()) as { error?: string; loginId?: string };
  if (!response.ok || !data.loginId) throw new Error(data.error || "Failed to sign up");
  return data.loginId;
}

async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Failed to logout");
}

async function deleteAccount(password: string) {
  const response = await fetch("/api/auth/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = (await response.json()) as { error?: string; ok?: boolean };
  if (!response.ok) throw new Error(data.error || "Failed to delete account");
}

function formatDate(ts: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
  }).format(new Date(ts));
}

function clampProgress(value: number, target: number) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.round((value / target) * 100));
}

function getLatestEntry(entries: ProgressEntry[]) {
  return entries.reduce<ProgressEntry | null>(
    (latest, entry) => (!latest || entry.createdAt > latest.createdAt ? entry : latest),
    null,
  );
}

function needsGoalReminder(goal: Goal) {
  const latestEntry = getLatestEntry(goal.entries);
  if (!latestEntry) return true;

  return Date.now() - latestEntry.createdAt >= 14 * 86_400_000;
}

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function getTodoTargetStatus(targetDate: string | undefined, language: AppLanguage = "en") {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return language === "ko" ? "목표일 미설정" : "Target not set";
  }

  return `${UI_TEXT[language].target}: ${targetDate} · ${getTodoTargetTiming(targetDate, language)}`;
}

function getTodoTargetTiming(targetDate: string, language: AppLanguage = "en") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return language === "ko" ? "목표일 필요" : "target date required";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${targetDate}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays > 0) return language === "ko" ? `${diffDays}일 남음` : `${diffDays} day${diffDays === 1 ? "" : "s"} left`;
  if (diffDays < 0) {
    const delayedDays = Math.abs(diffDays);
    return language === "ko" ? `${delayedDays}일 지연` : `${delayedDays} day${delayedDays === 1 ? "" : "s"} delayed`;
  }
  return language === "ko" ? "오늘까지" : "due today";
}

function isTodoDelayed(todo: Todo) {
  if (todo.completed || !todo.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(todo.targetDate)) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${todo.targetDate}T00:00:00`).getTime() < today.getTime();
}

function getTodoEditRows(value: string) {
  const lineCount = value.split(/\r\n|\r|\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 30)), 0);
  return Math.max(2, lineCount);
}

function toGoalDraft(goal: Goal): GoalDraft {
  return {
    goalId: goal.id,
    title: goal.title,
    memo: goal.memo,
    target: String(goal.target),
    unit: goal.unit,
    startDate: toDateInputValue(new Date(goal.createdAt)),
    deadline: goal.deadline,
  };
}

function moveToIndex<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function makeNavigationState(view: TrackerView, goalId: string | null): NavigationState {
  return {
    boostMastery: true,
    view,
    goalId: view === "detail" ? goalId : null,
  };
}

function isNavigationState(value: unknown): value is NavigationState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.boostMastery === true &&
    typeof record.view === "string" &&
    ["list", "todo", "routine", "archive", "bin", "detail", "user"].includes(record.view)
  );
}

function navigationKey(state: NavigationState) {
  return `${state.view}:${state.goalId ?? ""}`;
}

function readStoredNavigationState() {
  try {
    const stored = window.localStorage.getItem(NAVIGATION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return isNavigationState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredNavigationState(state: NavigationState) {
  try {
    window.localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore unavailable storage. Browser history still works for the current session.
  }
}

function clearStoredNavigationState() {
  try {
    window.localStorage.removeItem(NAVIGATION_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function readStoredDarkMode() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
}

function writeStoredDarkMode(isDarkMode: boolean) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  } catch {
    // Ignore unavailable storage.
  }
}

function readStoredLanguage(): AppLanguage {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "ko" ? "ko" : "en";
  } catch {
    return "en";
  }
}

function writeStoredLanguage(language: AppLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore unavailable storage.
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function isSwipeNavigationBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (isEditableTarget(target)) return true;
  if (target.closest("[data-screen-swipe-surface]")) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, summary, [data-swipe-ignore]",
    ),
  );
}

function getSwipeTargetView(currentView: TrackerView, deltaX: number) {
  if (currentView === "detail") return deltaX > 0 ? "list" : null;

  const currentIndex = SWIPE_NAVIGATION_ORDER.indexOf(currentView);
  if (currentIndex < 0) return null;

  const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
  return SWIPE_NAVIGATION_ORDER[nextIndex] ?? null;
}

function getTrackerViewLabel(view: TrackerView, language: AppLanguage = "en") {
  const text = UI_TEXT[language];
  switch (view) {
    case "list":
      return text.goalList;
    case "todo":
      return text.todoList;
    case "routine":
      return text.routineList;
    case "archive":
      return text.archive;
    case "bin":
      return text.bin;
    case "detail":
      return text.goalDetail;
    case "user":
      return text.user;
  }
}

async function fetchGoals() {
  const response = await fetch("/api/goals", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load goals");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchDeletedGoals() {
  const response = await fetch("/api/goals/bin", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load bin");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchArchivedGoals() {
  const response = await fetch("/api/goals/archive", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load archive");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchArchivedTodos() {
  const response = await fetch("/api/todos/archive", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to load archived todos");
  return Array.isArray(data.todos) ? data.todos : [];
}

async function fetchDeletedTodos() {
  const response = await fetch("/api/todos/bin", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to load deleted todos");
  return Array.isArray(data.todos) ? data.todos : [];
}

async function fetchArchivedRoutines() {
  const response = await fetch("/api/routines/archive", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; routines?: RoutineSummary[] };
  if (!response.ok) throw new Error(data.error || "Failed to load archived routines");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function fetchDeletedRoutines() {
  const response = await fetch("/api/routines/bin", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; routines?: RoutineSummary[] };
  if (!response.ok) throw new Error(data.error || "Failed to load deleted routines");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function createGoal(input: Omit<typeof emptyGoalForm, "startDate"> & { createdAt: number }) {
  const response = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error("Failed to add goal");
  return (await response.json()) as { goal: Goal; goals: Goal[] };
}

async function reorderGoalList(goalIds: string[]) {
  const response = await fetch("/api/goals", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goalIds }),
  });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to reorder goals");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchTodos() {
  const response = await fetch("/api/todos", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to load todos");
  return Array.isArray(data.todos) ? data.todos : [];
}

async function createTodo(title: string, targetDate: string, category: string) {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, targetDate, category }),
  });
  const data = (await response.json()) as { error?: string; todo?: Todo; todos?: Todo[] };
  if (!response.ok || !data.todo) throw new Error(data.error || "Failed to add todo");
  return { todo: data.todo, todos: Array.isArray(data.todos) ? data.todos : [] };
}

async function reorderTodoList(todoIds: string[]) {
  const response = await fetch("/api/todos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todoIds }),
  });
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to reorder todos");
  return Array.isArray(data.todos) ? data.todos : [];
}

async function patchTodo(todoId: string, patch: Partial<Pick<Todo, "title" | "completed" | "targetDate" | "category">>) {
  const response = await fetch(`/api/todos/${todoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to update todo");
  return Array.isArray(data.todos) ? data.todos : [];
}

async function removeTodo(todoId: string) {
  const response = await fetch(`/api/todos/${todoId}`, { method: "DELETE" });
  const data = (await response.json()) as { error?: string; todos?: Todo[]; deletedTodos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to delete todo");
  return {
    todos: Array.isArray(data.todos) ? data.todos : [],
    deletedTodos: Array.isArray(data.deletedTodos) ? data.deletedTodos : [],
  };
}

async function restoreStoredTodo(todoId: string) {
  const response = await fetch(`/api/todos/${todoId}/restore`, { method: "PATCH" });
  const data = (await response.json()) as { error?: string; todos?: Todo[]; archivedTodos?: Todo[]; deletedTodos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to restore todo");
  return data;
}

async function permanentlyRemoveTodo(todoId: string) {
  const response = await fetch(`/api/todos/${todoId}/permanent`, { method: "DELETE" });
  const data = (await response.json()) as { error?: string; deletedTodos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to permanently delete todo");
  return data;
}

async function patchGoal(goalId: string, patch: GoalPatch) {
  const response = await fetch(`/api/goals/${goalId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error("Failed to update goal");
  const data = (await response.json()) as { goals?: Goal[] };
  return Array.isArray(data.goals) ? data.goals : [];
}

async function removeGoal(goalId: string) {
  const response = await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete goal");
  const data = (await response.json()) as { deletedGoals?: Goal[]; goals?: Goal[] };
  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    deletedGoals: Array.isArray(data.deletedGoals) ? data.deletedGoals : [],
  };
}

async function archiveExistingGoal(goalId: string) {
  const response = await fetch(`/api/goals/${goalId}/archive`, { method: "PATCH" });
  if (!response.ok) throw new Error("Failed to archive goal");
  const data = (await response.json()) as { archivedGoals?: Goal[]; goals?: Goal[] };
  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    archivedGoals: Array.isArray(data.archivedGoals) ? data.archivedGoals : [],
  };
}

async function restoreDeletedGoal(goalId: string) {
  const response = await fetch(`/api/goals/${goalId}/restore`, { method: "PATCH" });
  if (!response.ok) throw new Error("Failed to restore goal");
  const data = (await response.json()) as { archivedGoals?: Goal[]; deletedGoals?: Goal[]; goals?: Goal[] };
  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    deletedGoals: Array.isArray(data.deletedGoals) ? data.deletedGoals : [],
    archivedGoals: Array.isArray(data.archivedGoals) ? data.archivedGoals : [],
  };
}

async function permanentlyRemoveGoal(goalId: string) {
  const response = await fetch(`/api/goals/${goalId}/permanent`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to permanently delete goal");
  const data = (await response.json()) as { deletedGoals?: Goal[]; goals?: Goal[] };
  return {
    goals: Array.isArray(data.goals) ? data.goals : [],
    deletedGoals: Array.isArray(data.deletedGoals) ? data.deletedGoals : [],
  };
}

async function restoreStoredRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}/restore`, { method: "PATCH" });
  const data = (await response.json()) as {
    error?: string;
    routines?: RoutineSummary[];
    archivedRoutines?: RoutineSummary[];
    deletedRoutines?: RoutineSummary[];
  };
  if (!response.ok) throw new Error(data.error || "Failed to restore routine");
  return data;
}

async function permanentlyRemoveRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}/permanent`, { method: "DELETE" });
  const data = (await response.json()) as { error?: string; deletedRoutines?: RoutineSummary[] };
  if (!response.ok) throw new Error(data.error || "Failed to permanently delete routine");
  return data;
}

async function createEntry(goalId: string, input: Pick<ProgressEntry, "value" | "memo" | "createdAt">) {
  const response = await fetch(`/api/goals/${goalId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error("Failed to add record");
  const data = (await response.json()) as { goals?: Goal[] };
  return Array.isArray(data.goals) ? data.goals : [];
}

async function patchEntry(goalId: string, entryId: string, patch: Pick<ProgressEntry, "value" | "memo" | "createdAt">) {
  const response = await fetch(`/api/goals/${goalId}/entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error("Failed to update record");
  const data = (await response.json()) as { goals?: Goal[] };
  return Array.isArray(data.goals) ? data.goals : [];
}

async function removeEntry(goalId: string, entryId: string) {
  const response = await fetch(`/api/goals/${goalId}/entries/${entryId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete record");
  const data = (await response.json()) as { goals?: Goal[] };
  return Array.isArray(data.goals) ? data.goals : [];
}

export default function GoalTracker() {
  const [loginId, setLoginId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState("");
  const [passwordForm, setPasswordForm] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isAccountDeleteOpen, setIsAccountDeleteOpen] = useState(false);
  const [accountDeletePassword, setAccountDeletePassword] = useState("");
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [deletedGoals, setDeletedGoals] = useState<Goal[]>([]);
  const [archivedGoals, setArchivedGoals] = useState<Goal[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [deletedTodos, setDeletedTodos] = useState<Todo[]>([]);
  const [archivedTodos, setArchivedTodos] = useState<Todo[]>([]);
  const [deletedRoutines, setDeletedRoutines] = useState<RoutineSummary[]>([]);
  const [archivedRoutines, setArchivedRoutines] = useState<RoutineSummary[]>([]);
  const [routineListResetKey, setRoutineListResetKey] = useState(0);
  const [routineReloadKey, setRoutineReloadKey] = useState(0);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<TrackerView>("list");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isEmptyBinModalOpen, setIsEmptyBinModalOpen] = useState(false);
  const [todoToDelete, setTodoToDelete] = useState<Todo | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoTitle, setEditingTodoTitle] = useState("");
  const [editingTodoTargetDate, setEditingTodoTargetDate] = useState("");
  const [editingTodoCategory, setEditingTodoCategory] = useState("");
  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(null);
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(null);
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [goalDropTargetId, setGoalDropTargetId] = useState<string | null>(null);
  const [todoDropTargetId, setTodoDropTargetId] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState(emptyGoalForm);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoTargetDate, setTodoTargetDate] = useState(() => toDateInputValue());
  const [todoCategory, setTodoCategory] = useState("");
  const [selectedTodoCategories, setSelectedTodoCategories] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [entryValue, setEntryValue] = useState(0);
  const [entryMemo, setEntryMemo] = useState("");
  const [entryRecordedAt, setEntryRecordedAt] = useState(() => toDateInputValue());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryValue, setEditEntryValue] = useState(0);
  const [editEntryMemo, setEditEntryMemo] = useState("");
  const [editEntryRecordedAt, setEditEntryRecordedAt] = useState(() => toDateInputValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window === "undefined" ? false : readStoredDarkMode(),
  );
  const [language, setLanguage] = useState<AppLanguage>(() =>
    typeof window === "undefined" ? "en" : readStoredLanguage(),
  );
  const [screenSwipeOffset, setScreenSwipeOffset] = useState(0);
  const [screenSwipeTargetView, setScreenSwipeTargetView] = useState<TrackerView | null>(null);
  const [screenSwipeTargetDirection, setScreenSwipeTargetDirection] = useState<-1 | 1 | null>(null);
  const [isScreenSwipeAnimating, setIsScreenSwipeAnimating] = useState(false);
  const [confettiParticles, setConfettiParticles] = useState<ConfettiParticle[]>([]);
  const goalSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingGoalPatches = useRef<Record<string, GoalPatch>>({});
  const goalSaveVersions = useRef<Record<string, number>>({});
  const highlightTimers = useRef<Record<"goal" | "todo", ReturnType<typeof setTimeout> | null>>({
    goal: null,
    todo: null,
  });
  const hasNavigationState = useRef(false);
  const isApplyingBrowserNavigation = useRef(false);
  const lastNavigationKey = useRef("");
  const previousView = useRef<TrackerView>("list");
  const goalMemoTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressGoalClickAfterDrag = useRef(false);
  const goalsBeforeDrag = useRef<Goal[] | null>(null);
  const todosBeforeDrag = useRef<Todo[] | null>(null);
  const latestDraggedGoals = useRef<Goal[] | null>(null);
  const latestDraggedTodos = useRef<Todo[] | null>(null);
  const dragImageClone = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const navDragState = useRef<NavDragState | null>(null);
  const screenSwipeState = useRef<ScreenSwipeState | null>(null);
  const screenSwipeAnimationTimer = useRef<number | null>(null);
  const suppressNextNavClick = useRef(false);
  const suppressNextScreenClick = useRef(false);
  const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiBurstId = useRef(0);
  const text = UI_TEXT[language];
  const navItems = useMemo(
    () => [
      { id: "list", label: text.goalList, shortLabel: text.goalShort, count: null },
      { id: "todo", label: text.todoList, shortLabel: text.todoShort, count: null },
      { id: "routine", label: text.routineList, shortLabel: text.routineShort, count: null },
      { id: "archive", label: text.archive, shortLabel: text.archive, count: null },
      { id: "bin", label: text.bin, shortLabel: text.bin, count: null },
    ],
    [text],
  );

  const flashMovedItem = useCallback((kind: "goal" | "todo", itemId: string) => {
    if (highlightTimers.current[kind]) clearTimeout(highlightTimers.current[kind]);

    if (kind === "goal") {
      setHighlightedGoalId(itemId);
      highlightTimers.current.goal = setTimeout(() => setHighlightedGoalId(null), 1100);
      return;
    }

    setHighlightedTodoId(itemId);
    highlightTimers.current.todo = setTimeout(() => setHighlightedTodoId(null), 1100);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialData() {
      try {
        const authError = new URLSearchParams(window.location.search).get("authError");
        if (authError) {
          setError(authError);
          window.history.replaceState(null, "", window.location.pathname);
        }

        const session = await fetchSession();
        if (!isActive) return;

        if (!session.loginId) {
          setLoginId(null);
          resetGoalState();
          setIsLoading(false);
          return;
        }

        setLoginId(session.loginId);
        setLoginForm(session.loginId);
        const [
          loadedGoals,
          loadedDeletedGoals,
          loadedArchivedGoals,
          loadedDeletedTodos,
          loadedArchivedTodos,
          loadedDeletedRoutines,
          loadedArchivedRoutines,
        ] = await Promise.all([
          fetchGoals(),
          fetchDeletedGoals(),
          fetchArchivedGoals(),
          fetchDeletedTodos(),
          fetchArchivedTodos(),
          fetchDeletedRoutines(),
          fetchArchivedRoutines(),
        ]);
        const firstGoal = loadedGoals[0] ?? null;
        const storedNavigation = readStoredNavigationState();
        const storedGoalId =
          storedNavigation?.goalId && loadedGoals.some((goal) => goal.id === storedNavigation.goalId)
            ? storedNavigation.goalId
            : null;
        const nextGoal = storedGoalId
          ? loadedGoals.find((goal) => goal.id === storedGoalId) ?? firstGoal
          : firstGoal;
        const nextView =
          storedNavigation?.view === "detail" && !nextGoal ? "list" : storedNavigation?.view ?? "list";
        const nextLatestEntry = nextGoal ? getLatestEntry(nextGoal.entries) : null;
        if (!isActive) return;
        setGoals(loadedGoals);
        setDeletedGoals(loadedDeletedGoals);
        setArchivedGoals(loadedArchivedGoals);
        setDeletedTodos(loadedDeletedTodos);
        setArchivedTodos(loadedArchivedTodos);
        setDeletedRoutines(loadedDeletedRoutines);
        setArchivedRoutines(loadedArchivedRoutines);
        setActiveGoalId(nextGoal?.id ?? null);
        setCurrentView(nextView);
        previousView.current = nextView;
        setIsEditingGoal(false);
        setGoalDraft(nextGoal ? toGoalDraft(nextGoal) : null);
        setEntryValue(nextLatestEntry?.value ?? 0);

        try {
          const loadedTodos = await fetchTodos();
          if (!isActive) return;
          setTodos(loadedTodos);
        } catch (todoError) {
          if (!isActive) return;
          setTodos([]);
          setError(todoError instanceof Error ? todoError.message : "Failed to load todos");
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load data");
      } finally {
        if (!isActive) return;
        setIsLoading(false);
      }
    }

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const timers = goalSaveTimers.current;
    const highlights = highlightTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
      Object.values(highlights).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      if (screenSwipeAnimationTimer.current) clearTimeout(screenSwipeAnimationTimer.current);
      if (confettiTimer.current) clearTimeout(confettiTimer.current);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", isDarkMode);
    document.body.classList.toggle("dark-mode", isDarkMode);
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
    document.body.dataset.theme = isDarkMode ? "dark" : "light";
    document.documentElement.style.colorScheme = isDarkMode ? "dark" : "light";
    writeStoredDarkMode(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    writeStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    function applyBrowserNavigation(event: PopStateEvent) {
      if (!isNavigationState(event.state)) return;

      const nextView = event.state.view === "detail" && !event.state.goalId ? "list" : event.state.view;
      const nextGoal = event.state.goalId && goals.some((goal) => goal.id === event.state.goalId)
        ? event.state.goalId
        : goals[0]?.id ?? null;

      isApplyingBrowserNavigation.current = true;
      lastNavigationKey.current = navigationKey(event.state);
      setCurrentView(nextView === "detail" && !nextGoal ? "list" : nextView);
      if (nextView === "detail") setActiveGoalId(nextGoal);
      setIsEditingGoal(false);
      setIsGoalModalOpen(false);
      setIsTodoModalOpen(false);
      setIsEntryModalOpen(false);
      setIsEmptyBinModalOpen(false);
      setTodoToDelete(null);
      setEditingTodoId(null);
      setEditingTodoTitle("");
    }

    window.addEventListener("popstate", applyBrowserNavigation);
    return () => window.removeEventListener("popstate", applyBrowserNavigation);
  }, [goals]);

  useEffect(() => {
    if (!loginId || isLoading) return;

    const state = makeNavigationState(currentView, activeGoalId);
    const key = navigationKey(state);
    writeStoredNavigationState(state);

    if (!hasNavigationState.current) {
      window.history.replaceState(state, "", window.location.href);
      hasNavigationState.current = true;
      lastNavigationKey.current = key;
      return;
    }

    if (isApplyingBrowserNavigation.current) {
      isApplyingBrowserNavigation.current = false;
      return;
    }

    if (lastNavigationKey.current === key) return;

    window.history.pushState(state, "", window.location.href);
    lastNavigationKey.current = key;
  }, [activeGoalId, currentView, isLoading, loginId]);

  useEffect(() => {
    function handleNavigationKeys(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const isUndo = (event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey;
      const isRedo = (event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey));
      const isBackspaceBack = event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (isUndo || isBackspaceBack) {
        event.preventDefault();
        window.history.back();
      }

      if (isRedo) {
        event.preventDefault();
        window.history.forward();
      }
    }

    window.addEventListener("keydown", handleNavigationKeys);
    return () => window.removeEventListener("keydown", handleNavigationKeys);
  }, []);

  const activeGoal = useMemo(
    () => goals.find((goal) => goal.id === activeGoalId) ?? null,
    [goals, activeGoalId],
  );

  const latestEntry = activeGoal ? getLatestEntry(activeGoal.entries) : null;
  const latestValue = latestEntry?.value ?? 0;
  const progressPercent = activeGoal ? clampProgress(latestValue, activeGoal.target) : 0;
  const activeGoalDraft = goalDraft?.goalId === activeGoal?.id ? goalDraft : activeGoal ? toGoalDraft(activeGoal) : null;
  const archivedItemCount = archivedGoals.length + archivedTodos.length + archivedRoutines.length;
  const deletedItemCount = deletedGoals.length + deletedTodos.length + deletedRoutines.length;
  const todoCategories = useMemo(
    () =>
      Array.from(new Set(todos.map((todo) => todo.category.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [todos],
  );
  const activeSelectedTodoCategories = useMemo(
    () => selectedTodoCategories.filter((category) => todoCategories.includes(category)),
    [selectedTodoCategories, todoCategories],
  );
  const selectedTodoCategorySet = useMemo(() => new Set(activeSelectedTodoCategories), [activeSelectedTodoCategories]);
  const visibleTodos = useMemo(
    () =>
      activeSelectedTodoCategories.length === 0
        ? todos
        : todos.filter((todo) => selectedTodoCategorySet.has(todo.category.trim())),
    [activeSelectedTodoCategories.length, selectedTodoCategorySet, todos],
  );

  useEffect(() => {
    const textarea = goalMemoTextareaRef.current;
    if (!textarea || !isEditingGoal) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeGoalDraft?.memo, activeGoalId, isEditingGoal]);

  useEffect(() => {
    const previous = previousView.current;
    if (currentView === "list" && previous === "detail" && activeGoalId) {
      flashMovedItem("goal", activeGoalId);
    }
    previousView.current = currentView;
  }, [activeGoalId, currentView, flashMovedItem]);

  function navigateToView(view: TrackerView) {
    setCurrentView(view);
    setIsEditingGoal(false);
    setIsAccountDeleteOpen(false);
    setIsGoalModalOpen(false);
    setIsTodoModalOpen(false);
    setIsEntryModalOpen(false);
    setIsEmptyBinModalOpen(false);
    setTodoToDelete(null);
    setEditingTodoId(null);
    setEditingTodoTitle("");
    setEditingTodoTargetDate("");
    setEditingTodoCategory("");
    if (view === "routine") setRoutineListResetKey((key) => key + 1);
    if (view === "archive" || view === "bin") void refreshArchiveBinData();
  }

  function resetGoalState() {
    clearStoredNavigationState();
    hasNavigationState.current = false;
    isApplyingBrowserNavigation.current = false;
    lastNavigationKey.current = "";
    previousView.current = "list";
    setGoals([]);
    setDeletedGoals([]);
    setArchivedGoals([]);
    setTodos([]);
    setDeletedTodos([]);
    setArchivedTodos([]);
    setDeletedRoutines([]);
    setArchivedRoutines([]);
    setActiveGoalId(null);
    setCurrentView("list");
    setIsEditingGoal(false);
    setIsGoalModalOpen(false);
    setIsTodoModalOpen(false);
    setIsEntryModalOpen(false);
    setIsEmptyBinModalOpen(false);
    setTodoToDelete(null);
    setEditingTodoId(null);
    setEditingTodoTitle("");
    setEditingTodoTargetDate("");
    setEditingTodoCategory("");
    setHighlightedGoalId(null);
    setHighlightedTodoId(null);
    setTodoTitle("");
    setTodoTargetDate(toDateInputValue());
    setTodoCategory("");
    setSelectedTodoCategories([]);
    setGoalDraft(null);
    setEntryValue(0);
    setEntryMemo("");
    setEditingEntryId(null);
  }

  function applyLoadedGoals(loadedGoals: Goal[], loadedDeletedGoals: Goal[], loadedArchivedGoals: Goal[]) {
    const firstGoal = loadedGoals[0] ?? null;
    const firstLatestEntry = firstGoal ? getLatestEntry(firstGoal.entries) : null;
    setGoals(loadedGoals);
    setDeletedGoals(loadedDeletedGoals);
    setArchivedGoals(loadedArchivedGoals);
    setActiveGoalId(firstGoal?.id ?? null);
    setIsEditingGoal(false);
    setGoalDraft(firstGoal ? toGoalDraft(firstGoal) : null);
    setEntryValue(firstLatestEntry?.value ?? 0);
  }

  async function loadGoalData() {
    const [
      loadedGoals,
      loadedDeletedGoals,
      loadedArchivedGoals,
      loadedDeletedTodos,
      loadedArchivedTodos,
      loadedDeletedRoutines,
      loadedArchivedRoutines,
    ] = await Promise.all([
      fetchGoals(),
      fetchDeletedGoals(),
      fetchArchivedGoals(),
      fetchDeletedTodos(),
      fetchArchivedTodos(),
      fetchDeletedRoutines(),
      fetchArchivedRoutines(),
    ]);
    applyLoadedGoals(loadedGoals, loadedDeletedGoals, loadedArchivedGoals);
    setDeletedTodos(loadedDeletedTodos);
    setArchivedTodos(loadedArchivedTodos);
    setDeletedRoutines(loadedDeletedRoutines);
    setArchivedRoutines(loadedArchivedRoutines);

    try {
      setTodos(await fetchTodos());
    } catch (todoError) {
      setTodos([]);
      setError(todoError instanceof Error ? todoError.message : "Failed to load todos");
    }
  }

  async function submitLogin() {
    const nextLoginId = loginForm.trim();
    if (!nextLoginId || !passwordForm) return;
    if (passwordForm.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const loggedInId = await login(nextLoginId, passwordForm);
      setLoginId(loggedInId);
      setLoginForm(loggedInId);
      setPasswordForm("");
      await loadGoalData();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Failed to login");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitSignup() {
    const nextLoginId = loginForm.trim();
    if (!nextLoginId || !passwordForm) return;
    if (passwordForm.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const signedUpId = await signup(nextLoginId, passwordForm);
      setLoginId(signedUpId);
      setLoginForm(signedUpId);
      setPasswordForm("");
      await loadGoalData();
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Failed to sign up");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitLogout() {
    setIsSaving(true);
    setError("");

    try {
      await logout();
      setLoginId(null);
      setPasswordForm("");
      resetGoalState();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to logout");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAccountDeletion() {
    if (accountDeleteConfirm !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await deleteAccount(accountDeletePassword);
      setLoginId(null);
      setLoginForm("");
      setPasswordForm("");
      setAccountDeletePassword("");
      setAccountDeleteConfirm("");
      setIsAccountDeleteOpen(false);
      resetGoalState();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete account");
    } finally {
      setIsSaving(false);
    }
  }

  async function addGoal() {
    const title = goalForm.title.trim();
    if (!title || goalForm.target <= 0) return;

    setIsSaving(true);
    setError("");

    try {
      const result = await createGoal({
        title,
        memo: goalForm.memo,
        target: goalForm.target,
        unit: goalForm.unit.trim() || "units",
        createdAt: parseDateInputValue(goalForm.startDate),
        deadline: goalForm.deadline,
      });
      setGoals(result.goals);
      setDeletedGoals((current) => current.filter((goal) => goal.id !== result.goal.id));
      setArchivedGoals((current) => current.filter((goal) => goal.id !== result.goal.id));
      setActiveGoalId(result.goal.id);
      setIsEditingGoal(false);
      setGoalDraft(toGoalDraft(result.goal));
      setEntryValue(0);
      setEntryMemo("");
      setEntryRecordedAt(toDateInputValue());
      setEditingEntryId(null);
      setGoalForm({ ...emptyGoalForm, startDate: toDateInputValue() });
      setIsGoalModalOpen(false);
      setCurrentView("detail");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveGoalOrder(nextGoals: Goal[], previousGoals: Goal[], movedGoalId: string) {
    if (nextGoals.map((goal) => goal.id).join("|") === previousGoals.map((goal) => goal.id).join("|")) return;

    setIsSaving(true);
    setError("");

    try {
      setGoals(await reorderGoalList(nextGoals.map((goal) => goal.id)));
      flashMovedItem("goal", movedGoalId);
    } catch (reorderError) {
      setGoals(previousGoals);
      setHighlightedGoalId(null);
      setError(reorderError instanceof Error ? reorderError.message : "Failed to reorder goals");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshArchiveBinData() {
    try {
      const [
        loadedDeletedGoals,
        loadedArchivedGoals,
        loadedDeletedTodos,
        loadedArchivedTodos,
        loadedDeletedRoutines,
        loadedArchivedRoutines,
      ] = await Promise.all([
        fetchDeletedGoals(),
        fetchArchivedGoals(),
        fetchDeletedTodos(),
        fetchArchivedTodos(),
        fetchDeletedRoutines(),
        fetchArchivedRoutines(),
      ]);
      setDeletedGoals(loadedDeletedGoals);
      setArchivedGoals(loadedArchivedGoals);
      setDeletedTodos(loadedDeletedTodos);
      setArchivedTodos(loadedArchivedTodos);
      setDeletedRoutines(loadedDeletedRoutines);
      setArchivedRoutines(loadedArchivedRoutines);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to load archive and bin");
    }
  }

  function makeFloatingDragCard(event: ReactPointerEvent) {
    const card = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-reorder-card]");
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const clone = card.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.opacity = "1";
    clone.style.background = "white";
    clone.style.boxShadow = "0 18px 40px rgba(15, 23, 42, 0.22)";
    clone.style.pointerEvents = "none";
    clone.style.zIndex = "9999";
    clone.style.transform = "scale(1.01)";
    clone.style.transition = "none";
    document.body.appendChild(clone);
    dragImageClone.current = clone;

    return {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  }

  function removeDragImageClone() {
    dragImageClone.current?.remove();
    dragImageClone.current = null;
  }

  function moveFloatingDragCard(clientX: number, clientY: number, offsetX: number, offsetY: number) {
    if (!dragImageClone.current) return;
    dragImageClone.current.style.left = `${clientX - offsetX}px`;
    dragImageClone.current.style.top = `${clientY - offsetY}px`;
  }

  function startNavDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;

    navDragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: nav.scrollLeft,
      didMove: false,
    };
    nav.setPointerCapture(event.pointerId);
  }

  function moveNavDrag(event: ReactPointerEvent<HTMLElement>) {
    const dragState = navDragState.current;
    const nav = navRef.current;
    if (!dragState || !nav || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    if (Math.abs(deltaX) > 4) {
      dragState.didMove = true;
      suppressNextNavClick.current = true;
    }
    if (dragState.didMove) event.preventDefault();
    nav.scrollLeft = dragState.scrollLeft - deltaX;
  }

  function endNavDrag(event: ReactPointerEvent<HTMLElement>) {
    const dragState = navDragState.current;
    const nav = navRef.current;
    if (!dragState || !nav || dragState.pointerId !== event.pointerId) return;

    if (nav.hasPointerCapture(event.pointerId)) {
      nav.releasePointerCapture(event.pointerId);
    }
    navDragState.current = null;
    if (dragState.didMove) {
      window.setTimeout(() => {
        suppressNextNavClick.current = false;
      }, 0);
    }
  }

  function startScreenSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (isSwipeNavigationBlockedTarget(event.target)) return;
    if (currentView !== "detail" && !SWIPE_NAVIGATION_ORDER.includes(currentView)) return;

    if (screenSwipeAnimationTimer.current) clearTimeout(screenSwipeAnimationTimer.current);
    setIsScreenSwipeAnimating(false);
    setScreenSwipeOffset(0);
    setScreenSwipeTargetView(null);
    setScreenSwipeTargetDirection(null);
    screenSwipeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      didSwipe: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveScreenSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeState = screenSwipeState.current;
    if (!swipeState || swipeState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;
    if (Math.abs(deltaX) > 14 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      swipeState.didSwipe = true;
      event.preventDefault();
      const nextView = getSwipeTargetView(currentView, deltaX);
      const viewportWidth = window.innerWidth || 1;
      const previewOffset = Math.max(-viewportWidth, Math.min(viewportWidth, deltaX));
      setScreenSwipeTargetView(nextView);
      setScreenSwipeTargetDirection(nextView ? (deltaX < 0 ? -1 : 1) : null);
      setScreenSwipeOffset(previewOffset);
    }
  }

  function endScreenSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeState = screenSwipeState.current;
    if (!swipeState || swipeState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    screenSwipeState.current = null;

    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;
    const isHorizontalSwipe =
      Math.abs(deltaX) >= SWIPE_MIN_DISTANCE &&
      Math.abs(deltaY) <= SWIPE_MAX_VERTICAL_DRIFT &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    if (!isHorizontalSwipe) {
      settleScreenSwipe(0);
      return;
    }

    const nextView = getSwipeTargetView(currentView, deltaX);
    if (!nextView) {
      settleScreenSwipe(0);
      return;
    }

    suppressNextScreenClick.current = true;
    setIsScreenSwipeAnimating(true);
    setScreenSwipeTargetView(nextView);
    setScreenSwipeTargetDirection(deltaX < 0 ? -1 : 1);
    setScreenSwipeOffset(deltaX > 0 ? window.innerWidth : -window.innerWidth);
    screenSwipeAnimationTimer.current = window.setTimeout(() => {
      navigateToView(nextView);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
      setIsScreenSwipeAnimating(false);
      setScreenSwipeOffset(0);
      setScreenSwipeTargetView(null);
      setScreenSwipeTargetDirection(null);
      screenSwipeAnimationTimer.current = null;
    }, 260);
    window.setTimeout(() => {
      suppressNextScreenClick.current = false;
    }, 350);
  }

  function settleScreenSwipe(offset: number) {
    setIsScreenSwipeAnimating(true);
    setScreenSwipeOffset(offset);
    if (screenSwipeAnimationTimer.current) clearTimeout(screenSwipeAnimationTimer.current);
    screenSwipeAnimationTimer.current = window.setTimeout(() => {
      setIsScreenSwipeAnimating(false);
      setScreenSwipeTargetView(null);
      setScreenSwipeTargetDirection(null);
      screenSwipeAnimationTimer.current = null;
    }, 220);
  }

  function cancelScreenSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeState = screenSwipeState.current;
    if (!swipeState || swipeState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    screenSwipeState.current = null;
    settleScreenSwipe(0);
  }

  function startGoalDrag(event: ReactPointerEvent, goalId: string) {
    if (isSaving) {
      event.preventDefault();
      return;
    }

    const dragOffset = makeFloatingDragCard(event);
    if (!dragOffset) return;

    event.preventDefault();
    event.stopPropagation();
    goalsBeforeDrag.current = goals;
    latestDraggedGoals.current = goals;
    setDraggingGoalId(goalId);
    setGoalDropTargetId(goalId);
    suppressGoalClickAfterDrag.current = true;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      moveFloatingDragCard(pointerEvent.clientX, pointerEvent.clientY, dragOffset.offsetX, dragOffset.offsetY);

      const targetCard = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>('[data-reorder-kind="goal"]');
      const targetGoalId = targetCard?.dataset.reorderId;
      if (!targetGoalId || targetGoalId === goalId) return;

      setGoalDropTargetId(targetGoalId);
      setGoals((currentGoals) => {
        const fromIndex = currentGoals.findIndex((goal) => goal.id === goalId);
        const toIndex = currentGoals.findIndex((goal) => goal.id === targetGoalId);
        const nextGoals = moveToIndex(currentGoals, fromIndex, toIndex);
        latestDraggedGoals.current = nextGoals;
        return nextGoals;
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      const previousGoals = goalsBeforeDrag.current;
      const nextGoals = latestDraggedGoals.current;

      setDraggingGoalId(null);
      setGoalDropTargetId(null);
      removeDragImageClone();
      goalsBeforeDrag.current = null;
      latestDraggedGoals.current = null;

      if (previousGoals && nextGoals) {
        void saveGoalOrder(nextGoals, previousGoals, goalId);
      }

      window.setTimeout(() => {
        suppressGoalClickAfterDrag.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  async function addTodoItem() {
    const title = todoTitle.trim();
    const targetDate = todoTargetDate.trim();
    const category = todoCategory.trim();
    if (!title || !targetDate || !loginId) return;

    setIsSaving(true);
    setError("");

    try {
      const result = await createTodo(title, targetDate, category);
      setTodos(result.todos);
      setTodoTitle("");
      setTodoTargetDate(toDateInputValue());
      setTodoCategory("");
      setIsTodoModalOpen(false);
      setCurrentView("todo");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add todo");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingTodo(todo: Todo) {
    setEditingTodoId(todo.id);
    setEditingTodoTitle(todo.title);
    setEditingTodoTargetDate(todo.targetDate ?? toDateInputValue());
    setEditingTodoCategory(todo.category);
    setTodoToDelete(null);
  }

  function cancelEditingTodo() {
    setEditingTodoId(null);
    setEditingTodoTitle("");
    setEditingTodoTargetDate("");
    setEditingTodoCategory("");
  }

  function toggleTodoCategoryFilter(category: string) {
    setSelectedTodoCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  async function saveTodoTitle(todo: Todo) {
    if (!loginId) return;

    const title = editingTodoTitle.trim();
    const targetDate = editingTodoTargetDate.trim();
    const category = editingTodoCategory.trim();
    if (!title) {
      setError("Todo title is required");
      return;
    }

    if (!targetDate) {
      setError("Todo target date is required");
      return;
    }

    if (title === todo.title && targetDate === (todo.targetDate ?? "") && category === todo.category) {
      cancelEditingTodo();
      return;
    }

    const previousTodos = todos;
    setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, title, targetDate, category } : item)));
    setIsSaving(true);
    setError("");

    try {
      setTodos(await patchTodo(todo.id, { title, targetDate, category }));
      cancelEditingTodo();
    } catch (updateError) {
      setTodos(previousTodos);
      setError(updateError instanceof Error ? updateError.message : "Failed to update todo");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTodoOrder(nextTodos: Todo[], previousTodos: Todo[], movedTodoId: string) {
    if (nextTodos.map((todo) => todo.id).join("|") === previousTodos.map((todo) => todo.id).join("|")) return;

    setIsSaving(true);
    setError("");

    try {
      setTodos(await reorderTodoList(nextTodos.map((todo) => todo.id)));
      flashMovedItem("todo", movedTodoId);
    } catch (reorderError) {
      setTodos(previousTodos);
      setHighlightedTodoId(null);
      setError(reorderError instanceof Error ? reorderError.message : "Failed to reorder todos");
    } finally {
      setIsSaving(false);
    }
  }

  function startTodoDrag(event: ReactPointerEvent, todoId: string) {
    if (isSaving || editingTodoId !== null) {
      event.preventDefault();
      return;
    }

    const dragOffset = makeFloatingDragCard(event);
    if (!dragOffset) return;

    event.preventDefault();
    event.stopPropagation();
    todosBeforeDrag.current = todos;
    latestDraggedTodos.current = todos;
    setDraggingTodoId(todoId);
    setTodoDropTargetId(todoId);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      moveFloatingDragCard(pointerEvent.clientX, pointerEvent.clientY, dragOffset.offsetX, dragOffset.offsetY);

      const targetCard = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>('[data-reorder-kind="todo"]');
      const targetTodoId = targetCard?.dataset.reorderId;
      if (!targetTodoId || targetTodoId === todoId) return;

      setTodoDropTargetId(targetTodoId);
      setTodos((currentTodos) => {
        const fromIndex = currentTodos.findIndex((todo) => todo.id === todoId);
        const toIndex = currentTodos.findIndex((todo) => todo.id === targetTodoId);
        const nextTodos = moveToIndex(currentTodos, fromIndex, toIndex);
        latestDraggedTodos.current = nextTodos;
        return nextTodos;
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      const previousTodos = todosBeforeDrag.current;
      const nextTodos = latestDraggedTodos.current;

      setDraggingTodoId(null);
      setTodoDropTargetId(null);
      removeDragImageClone();
      todosBeforeDrag.current = null;
      latestDraggedTodos.current = null;

      if (previousTodos && nextTodos) {
        void saveTodoOrder(nextTodos, previousTodos, todoId);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function triggerSuccessConfetti() {
    const burstId = confettiBurstId.current + 1;
    confettiBurstId.current = burstId;
    const particles = Array.from({ length: 34 }, (_, index) => ({
      id: `${burstId}-${index}`,
      left: 12 + pseudoRandom(burstId * 100 + index) * 76,
      size: 6 + pseudoRandom(burstId * 200 + index) * 8,
      x: -120 + pseudoRandom(burstId * 300 + index) * 240,
      rotate: -180 + pseudoRandom(burstId * 400 + index) * 360,
      delay: pseudoRandom(burstId * 500 + index) * 0.16,
      duration: 1.9 + pseudoRandom(burstId * 600 + index) * 0.85,
      color: confettiColors[index % confettiColors.length],
    }));

    setConfettiParticles(particles);
    if (confettiTimer.current) clearTimeout(confettiTimer.current);
    confettiTimer.current = setTimeout(() => setConfettiParticles([]), 3000);
  }

  async function toggleTodoItem(todo: Todo) {
    if (!loginId) return;

    const nextCompleted = !todo.completed;
    const nextTodos = todos.map((item) => (item.id === todo.id ? { ...item, completed: nextCompleted } : item));
    setTodos(nextTodos);

    setIsSaving(true);
    setError("");

    try {
      setTodos(await patchTodo(todo.id, { completed: nextCompleted }));
      if (nextCompleted) triggerSuccessConfetti();
    } catch (updateError) {
      setTodos(todos);
      setError(updateError instanceof Error ? updateError.message : "Failed to update todo");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTodoItem(todoId: string) {
    if (!loginId) return;

    const previousTodos = todos;
    setTodos((current) => current.filter((todo) => todo.id !== todoId));

    setIsSaving(true);
    setError("");

    try {
      const result = await removeTodo(todoId);
      setTodos(result.todos);
      setDeletedTodos(result.deletedTodos);
      setTodoToDelete(null);
    } catch (deleteError) {
      setTodos(previousTodos);
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete todo");
    } finally {
      setIsSaving(false);
    }
  }

  function updateActiveGoal(patch: GoalPatch) {
    if (!activeGoal) return;
    const goalId = activeGoal.id;
    const saveVersion = (goalSaveVersions.current[goalId] ?? 0) + 1;
    goalSaveVersions.current[goalId] = saveVersion;

    setGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              ...patch,
              target: patch.target !== undefined ? Math.max(1, patch.target) : goal.target,
              unit: patch.unit !== undefined ? patch.unit || "units" : goal.unit,
            }
          : goal,
      ),
    );

    pendingGoalPatches.current[goalId] = {
      ...pendingGoalPatches.current[goalId],
      ...patch,
    };

    clearTimeout(goalSaveTimers.current[goalId]);
    goalSaveTimers.current[goalId] = setTimeout(async () => {
      const patchToSave = pendingGoalPatches.current[goalId];
      delete pendingGoalPatches.current[goalId];

      if (!patchToSave) return;

      setIsSaving(true);
      setError("");

      try {
        const savedGoals = await patchGoal(goalId, patchToSave);
        const savedGoal = savedGoals.find((goal) => goal.id === goalId);

        if (savedGoal && goalSaveVersions.current[goalId] === saveVersion) {
          setGoals((currentGoals) => currentGoals.map((goal) => (goal.id === goalId ? savedGoal : goal)));
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Failed to update goal");
      } finally {
        setIsSaving(false);
      }
    }, 350);
  }

  function commitGoalDraft(field: keyof Omit<GoalDraft, "goalId">, rawValue?: string) {
    if (!activeGoal) return;
    const draft = goalDraft?.goalId === activeGoal.id ? goalDraft : toGoalDraft(activeGoal);

    if (field === "title") {
      const title = (rawValue ?? draft.title).trim();
      if (!title) {
        setGoalDraft((draft) => (draft ? { ...draft, title: activeGoal.title } : draft));
        return;
      }
      if (title !== activeGoal.title) updateActiveGoal({ title });
      setGoalDraft((draft) => (draft ? { ...draft, title } : draft));
      return;
    }

    if (field === "memo") {
      const memo = rawValue ?? draft.memo;
      if (memo !== activeGoal.memo) updateActiveGoal({ memo });
      return;
    }

    if (field === "target") {
      const targetText = rawValue ?? draft.target;
      const target = Number(targetText);
      if (!Number.isFinite(target) || target <= 0) {
        setGoalDraft((draft) => (draft ? { ...draft, target: String(activeGoal.target) } : draft));
        return;
      }
      if (target !== activeGoal.target) updateActiveGoal({ target });
      setGoalDraft((draft) => (draft ? { ...draft, target: String(target) } : draft));
      return;
    }

    if (field === "unit") {
      const unit = (rawValue ?? draft.unit).trim() || "units";
      if (unit !== activeGoal.unit) updateActiveGoal({ unit });
      setGoalDraft((draft) => (draft ? { ...draft, unit } : draft));
      return;
    }

    if (field === "deadline") {
      const deadline = rawValue ?? draft.deadline;
      if (deadline !== activeGoal.deadline) updateActiveGoal({ deadline });
      return;
    }

    if (field === "startDate") {
      const startDate = rawValue ?? draft.startDate;
      const createdAt = parseDateInputValue(startDate);
      if (createdAt !== activeGoal.createdAt) updateActiveGoal({ createdAt });
      setGoalDraft((draft) => (draft ? { ...draft, startDate: toDateInputValue(new Date(createdAt)) } : draft));
    }
  }

  function finishEditingGoal() {
    if (!activeGoal || !activeGoalDraft) return;
    commitGoalDraft("title", activeGoalDraft.title);
    commitGoalDraft("memo", activeGoalDraft.memo);
    commitGoalDraft("target", activeGoalDraft.target);
    commitGoalDraft("unit", activeGoalDraft.unit);
    commitGoalDraft("startDate", activeGoalDraft.startDate);
    commitGoalDraft("deadline", activeGoalDraft.deadline);
    setIsEditingGoal(false);
  }

  function cancelEditingGoal() {
    if (activeGoal) setGoalDraft(toGoalDraft(activeGoal));
    setIsEditingGoal(false);
  }

  async function addEntry() {
    if (!activeGoal || !Number.isFinite(entryValue)) return;

    const previousLatestValue = getLatestEntry(activeGoal.entries)?.value ?? 0;
    setIsSaving(true);
    setError("");

    try {
      const savedGoals = await createEntry(activeGoal.id, {
        value: Math.max(0, entryValue),
        memo: entryMemo.trim(),
        createdAt: parseDateInputValue(entryRecordedAt),
      });
      const savedGoal = savedGoals.find((goal) => goal.id === activeGoal.id);
      const nextLatestValue = getLatestEntry(savedGoal?.entries ?? [])?.value ?? 0;
      setGoals(savedGoals);
      if (nextLatestValue > previousLatestValue) triggerSuccessConfetti();
      setEntryMemo("");
      setEntryRecordedAt(toDateInputValue());
      setEditingEntryId(null);
      setIsEntryModalOpen(false);
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : "Failed to add record");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteGoal(goalId: string) {
    const nextGoals = goals.filter((goal) => goal.id !== goalId);
    if (activeGoalId === goalId) {
      const nextGoal = nextGoals[0] ?? null;
      const nextLatestEntry = getLatestEntry(nextGoal?.entries ?? []);
      setActiveGoalId(nextGoal?.id ?? null);
      setIsEditingGoal(false);
      setGoalDraft(nextGoal ? toGoalDraft(nextGoal) : null);
      setEntryValue(nextLatestEntry?.value ?? 0);
      setCurrentView("bin");
    }
    setGoals(nextGoals);
    setCurrentView("bin");
    setIsSaving(true);
    setError("");

    try {
      const result = await removeGoal(goalId);
      setGoals(result.goals);
      setDeletedGoals(result.deletedGoals);
      setArchivedGoals((current) => current.filter((goal) => goal.id !== goalId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveGoal(goalId: string) {
    const nextGoals = goals.filter((goal) => goal.id !== goalId);
    if (activeGoalId === goalId) {
      const nextGoal = nextGoals[0] ?? null;
      const nextLatestEntry = getLatestEntry(nextGoal?.entries ?? []);
      setActiveGoalId(nextGoal?.id ?? null);
      setIsEditingGoal(false);
      setGoalDraft(nextGoal ? toGoalDraft(nextGoal) : null);
      setEntryValue(nextLatestEntry?.value ?? 0);
      setCurrentView("archive");
    }
    setGoals(nextGoals);
    setIsSaving(true);
    setError("");

    try {
      const result = await archiveExistingGoal(goalId);
      setGoals(result.goals);
      setArchivedGoals(result.archivedGoals);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreGoal(goalId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await restoreDeletedGoal(goalId);
      const restoredGoal = result.goals.find((goal) => goal.id === goalId) ?? null;
      const restoredLatestEntry = restoredGoal ? getLatestEntry(restoredGoal.entries) : null;
      setGoals(result.goals);
      setDeletedGoals(result.deletedGoals);
      setArchivedGoals(result.archivedGoals);
      setActiveGoalId(restoredGoal?.id ?? result.goals[0]?.id ?? null);
      setIsEditingGoal(false);
      setGoalDraft(restoredGoal ? toGoalDraft(restoredGoal) : result.goals[0] ? toGoalDraft(result.goals[0]) : null);
      setEntryValue(restoredLatestEntry?.value ?? getLatestEntry(result.goals[0]?.entries ?? [])?.value ?? 0);
      setEntryMemo("");
      setEntryRecordedAt(toDateInputValue());
      setEditingEntryId(null);
      setIsEntryModalOpen(false);
      setCurrentView("detail");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function permanentlyDeleteGoal(goalId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await permanentlyRemoveGoal(goalId);
      setGoals(result.goals);
      setDeletedGoals(result.deletedGoals);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to permanently delete goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreTodo(todoId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await restoreStoredTodo(todoId);
      setTodos(Array.isArray(result.todos) ? result.todos : []);
      setArchivedTodos(Array.isArray(result.archivedTodos) ? result.archivedTodos : []);
      setDeletedTodos(Array.isArray(result.deletedTodos) ? result.deletedTodos : []);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore todo");
    } finally {
      setIsSaving(false);
    }
  }

  async function permanentlyDeleteTodo(todoId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await permanentlyRemoveTodo(todoId);
      setDeletedTodos(Array.isArray(result.deletedTodos) ? result.deletedTodos : []);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to permanently delete todo");
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreRoutine(routineId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await restoreStoredRoutine(routineId);
      setArchivedRoutines(Array.isArray(result.archivedRoutines) ? result.archivedRoutines : []);
      setDeletedRoutines(Array.isArray(result.deletedRoutines) ? result.deletedRoutines : []);
      setRoutineReloadKey((key) => key + 1);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore routine");
    } finally {
      setIsSaving(false);
    }
  }

  async function permanentlyDeleteRoutine(routineId: string) {
    setIsSaving(true);
    setError("");

    try {
      const result = await permanentlyRemoveRoutine(routineId);
      setDeletedRoutines(Array.isArray(result.deletedRoutines) ? result.deletedRoutines : []);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to permanently delete routine");
    } finally {
      setIsSaving(false);
    }
  }

  async function emptyBin() {
    if (deletedItemCount === 0) return;

    const goalIds = deletedGoals.map((goal) => goal.id);
    const todoIds = deletedTodos.map((todo) => todo.id);
    const routineIds = deletedRoutines.map((routine) => routine.id);

    setIsSaving(true);
    setError("");

    try {
      await Promise.all([
        ...goalIds.map((goalId) => permanentlyRemoveGoal(goalId)),
        ...todoIds.map((todoId) => permanentlyRemoveTodo(todoId)),
        ...routineIds.map((routineId) => permanentlyRemoveRoutine(routineId)),
      ]);
      setDeletedGoals([]);
      setDeletedTodos([]);
      setDeletedRoutines([]);
      setIsEmptyBinModalOpen(false);
    } catch (deleteError) {
      await refreshArchiveBinData();
      setError(deleteError instanceof Error ? deleteError.message : "Failed to empty bin");
    } finally {
      setIsSaving(false);
    }
  }

  function selectGoal(goal: Goal) {
    const goalLatestEntry = getLatestEntry(goal.entries);
    flashMovedItem("goal", goal.id);
    setActiveGoalId(goal.id);
    setCurrentView("detail");
    setIsEditingGoal(false);
    setGoalDraft(toGoalDraft(goal));
    setEntryValue(goalLatestEntry?.value ?? 0);
    setEntryMemo("");
    setEntryRecordedAt(toDateInputValue());
    setEditingEntryId(null);
    setIsEntryModalOpen(false);
  }

  function startEditingEntry(entry: ProgressEntry) {
    setEditingEntryId(entry.id);
    setEditEntryValue(entry.value);
    setEditEntryMemo(entry.memo);
    setEditEntryRecordedAt(toDateInputValue(new Date(entry.createdAt)));
    setError("");
  }

  async function updateEntryRecord(entryId: string) {
    if (!activeGoal || !Number.isFinite(editEntryValue)) return;

    const previousLatestValue = getLatestEntry(activeGoal.entries)?.value ?? 0;
    setIsSaving(true);
    setError("");

    try {
      const savedGoals = await patchEntry(activeGoal.id, entryId, {
        value: Math.max(0, editEntryValue),
        memo: editEntryMemo.trim(),
        createdAt: parseDateInputValue(editEntryRecordedAt),
      });
      const savedGoal = savedGoals.find((goal) => goal.id === activeGoal.id);
      const nextLatestValue = getLatestEntry(savedGoal?.entries ?? [])?.value ?? 0;
      setGoals(savedGoals);
      if (nextLatestValue > previousLatestValue) triggerSuccessConfetti();
      setEditingEntryId(null);
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : "Failed to update record");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEntryRecord(entryId: string) {
    if (!activeGoal) return;

    setIsSaving(true);
    setError("");

    try {
      const savedGoals = await removeEntry(activeGoal.id, entryId);
      setGoals(savedGoals);
      setEditingEntryId(null);
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : "Failed to delete record");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!loginId) {
    return (
      <LoginScreen
        loginId={loginForm}
        password={passwordForm}
        mode={authMode}
        language={language}
        error={error}
        isSaving={isSaving}
        onLoginIdChange={setLoginForm}
        onPasswordChange={setPasswordForm}
        onModeChange={setAuthMode}
        onSubmit={submitLogin}
        onSignup={submitSignup}
      />
    );
  }

  return (
    <main
      onPointerDown={startScreenSwipe}
      onPointerMove={moveScreenSwipe}
      onPointerUp={endScreenSwipe}
      onPointerCancel={cancelScreenSwipe}
      onClickCapture={(event) => {
        if (!suppressNextScreenClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressNextScreenClick.current = false;
      }}
      className={`relative min-h-screen overflow-x-hidden touch-pan-y bg-[#f6f7f4] pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-stone-950 sm:pb-0 ${
        isDarkMode ? "app-dark" : ""
      }`}
    >
      {confettiParticles.length > 0 && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
          <div className="routine-clap-burst">
            <span className="routine-celebration-icon routine-celebration-icon-you">
              <Image
                src={youIcon}
                alt=""
                width={260}
                height={260}
                className="routine-celebration-image h-full w-full object-contain"
              />
            </span>
            <span className="routine-celebration-icon routine-celebration-icon-best">
              <Image
                src={bestIcon}
                alt=""
                width={260}
                height={260}
                className="routine-celebration-image h-full w-full object-contain"
              />
            </span>
          </div>
          {confettiParticles.map((particle) => (
            <span
              key={particle.id}
              className="routine-confetti-particle"
              style={
                {
                  left: `${particle.left}%`,
                  width: `${particle.size}px`,
                  height: `${particle.size * 1.55}px`,
                  backgroundColor: particle.color,
                  animationDelay: `${particle.delay}s`,
                  animationDuration: `${particle.duration}s`,
                  "--confetti-x": `${particle.x}px`,
                  "--confetti-rotate": `${particle.rotate}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-2.5 py-6 sm:px-4 lg:px-5">
        <Head
          language={language}
          text={text}
          isDarkMode={isDarkMode}
          isUserView={currentView === "user"}
          onLanguageToggle={() => setLanguage((current) => (current === "en" ? "ko" : "en"))}
          onThemeToggle={() => setIsDarkMode((current) => !current)}
          onUserOpen={() => {
            setCurrentView("user");
            setIsEditingGoal(false);
            setIsGoalModalOpen(false);
            setIsTodoModalOpen(false);
            setIsEntryModalOpen(false);
            setTodoToDelete(null);
            setEditingTodoId(null);
            setEditingTodoTitle("");
          }}
        />

        {(error || isSaving || isLoading) && (
          <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
            <div
              role={error ? "alert" : "status"}
              aria-live="polite"
              className={`max-w-[calc(100vw-2rem)] rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur-md ${
                error
                  ? "border-red-200 bg-red-50/85 text-red-800"
                  : "border-stone-300 bg-white/70 text-stone-700"
              }`}
            >
              {isLoading ? "Loading local DB..." : isSaving ? "Saving to DB..." : error}
            </div>
          </div>
        )}

        <nav
          ref={navRef}
          data-swipe-ignore
          onPointerDown={startNavDrag}
          onPointerMove={moveNavDrag}
          onPointerUp={endNavDrag}
          onPointerCancel={endNavDrag}
          className="sticky top-0 z-40 hidden cursor-grab gap-1 overflow-x-auto rounded-full border border-stone-300 bg-white/95 p-1 shadow-sm backdrop-blur active:cursor-grabbing sm:flex sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => {
                if (suppressNextNavClick.current) {
                  event.preventDefault();
                  return;
                }
                navigateToView(item.id as TrackerView);
              }}
              className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold leading-none transition ${
                currentView === item.id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              {item.id === "list" && <ListIcon />}
              {item.id === "todo" && <TodoIcon />}
              {item.id === "routine" && <RoutineIcon />}
              {item.id === "archive" && <ArchiveIcon />}
              {item.id === "bin" && <BinIcon />}
              <span className="max-w-full truncate whitespace-nowrap">{item.label}</span>
              {item.count !== null && (
                <span
                  className={`hidden h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] sm:inline-flex ${
                    currentView === item.id ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="relative min-w-0 overflow-hidden">
          <div
            className={`min-w-0 transform-gpu ${
              isScreenSwipeAnimating ? "transition-transform duration-[260ms] ease-out" : ""
            }`}
            style={{
              transform: `translateX(${screenSwipeOffset}px)`,
            }}
          >
        <section className={`min-w-0 ${currentView === "user" ? "grid gap-0" : "hidden"}`}>
          <div className="p-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <UserIcon />
                  {text.user}
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">Login ID</dt>
                    <dd className="mt-1 font-semibold">{loginId}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">{text.goalShort}</dt>
                    <dd className="mt-1 font-semibold">{goals.length}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">{text.archived}</dt>
                    <dd className="mt-1 font-semibold">{archivedItemCount}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">{text.bin}</dt>
                    <dd className="mt-1 font-semibold">{deletedItemCount}</dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsAccountDeleteOpen((open) => !open)}
                  disabled={isSaving}
                  className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                >
                  Delete account
                </button>
                <button
                  type="button"
                  onClick={submitLogout}
                  disabled={isSaving}
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </section>

        {currentView === "user" && isAccountDeleteOpen && (
          <section className="border border-transparent bg-transparent p-0">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,160px)_auto] md:items-end">
              <div>
                <h2 className="text-base font-semibold text-red-800">Delete account</h2>
                <p className="mt-1 text-sm text-stone-600">
                  This permanently deletes this ID and its goals. Type DELETE to confirm.
                </p>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                Password
                <input
                  type="password"
                  value={accountDeletePassword}
                  onChange={(event) => setAccountDeletePassword(event.target.value)}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-red-500"
                  placeholder="Required for ID accounts"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Confirm
                <input
                  value={accountDeleteConfirm}
                  onChange={(event) => setAccountDeleteConfirm(event.target.value)}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-red-500"
                  placeholder="DELETE"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitAccountDeletion}
                  disabled={isSaving || accountDeleteConfirm !== "DELETE"}
                  className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountDeleteOpen(false);
                    setAccountDeletePassword("");
                    setAccountDeleteConfirm("");
                  }}
                  disabled={isSaving}
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.cancel}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="min-w-0">
          <aside className={`min-w-0 flex-col gap-0 ${currentView === "detail" || currentView === "user" ? "hidden" : "flex"}`}>
            <div className={currentView === "list" ? "" : "hidden"}>
              <div className="flex items-center gap-2 px-1 pb-2">
                <h2 className="text-base font-semibold">{text.goalList}</h2>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{goals.length}</span>
                  <button
                    type="button"
                    aria-expanded={isGoalModalOpen}
                    aria-label="Add goal"
                    onClick={() => {
                      setCurrentView("list");
                      setIsGoalModalOpen(true);
                    }}
                    className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    {text.add}
                  </button>
                </div>
              </div>
              {currentView === "list" && (
                <div className="space-y-2">
                  {goals.length === 0 ? (
                    <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                      {text.noGoals}
                    </p>
                  ) : (
                    goals.map((goal) => {
                      const latest = getLatestEntry(goal.entries)?.value ?? 0;
                      const percent = Math.min(100, clampProgress(latest, goal.target));
                      const showReminder = needsGoalReminder(goal);

                      return (
                        <div
                          key={goal.id}
                          data-reorder-card
                          data-reorder-kind="goal"
                          data-reorder-id={goal.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (suppressGoalClickAfterDrag.current) return;
                            selectGoal(goal);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectGoal(goal);
                            }
                          }}
                          className={`relative w-full cursor-pointer overflow-hidden rounded-md border p-3 text-left transition-all duration-500 ${
                            highlightedGoalId === goal.id
                              ? "border-emerald-500 bg-emerald-100 shadow-sm"
                              : goalDropTargetId === goal.id && draggingGoalId !== goal.id
                                ? "border-emerald-500 bg-white shadow-sm"
                              : draggingGoalId === goal.id
                                  ? "border-stone-400 bg-white opacity-90 shadow-sm"
                              : showReminder
                                ? "border-red-200 bg-red-50/70 hover:border-red-300"
                                : "border-stone-200 bg-white hover:border-stone-400"
                          }`}
                        >
                          {showReminder && (
                            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-right text-lg font-black tracking-wide text-red-700/15 sm:text-2xl">
                              DON&apos;T FORGET
                            </div>
                          )}
                          <div className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <span className="min-w-0 font-medium">{goal.title}</span>
                                <span className="shrink-0 text-sm text-stone-600">
                                  {latest} / {goal.target} {goal.unit}
                                </span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                                <div className="h-full bg-emerald-700" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                            <div className="flex shrink-0 justify-end">
                              <ReorderHandle
                                disabled={isSaving}
                                label={`Drag ${goal.title} to reorder`}
                                onPointerDown={(event) => startGoalDrag(event, goal.id)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div
              className={`border border-transparent bg-transparent p-0 ${
                currentView === "todo" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TodoIcon />
                  {text.todoList}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">
                    {activeSelectedTodoCategories.length ? `${visibleTodos.length}/${todos.length}` : todos.length}
                  </span>
                  <button
                    type="button"
                    aria-expanded={isTodoModalOpen}
                    aria-label="Add todo"
                    onClick={() => {
                      setCurrentView("todo");
                      setIsTodoModalOpen(true);
                    }}
                    className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    {text.add}
                  </button>
                </div>
              </div>
              {todoCategories.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 px-1">
                  {todoCategories.map((category) => {
                    const isSelected = selectedTodoCategorySet.has(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTodoCategoryFilter(category)}
                        className={`min-h-8 rounded-md border px-3 py-1 text-xs font-semibold transition ${
                          isSelected
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                  {activeSelectedTodoCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTodoCategories([])}
                      className="min-h-8 rounded-md border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      {text.all}
                    </button>
                  )}
                </div>
              )}
              {currentView === "todo" && (
                <div className="space-y-2">
                  {todos.length === 0 ? (
                    <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                      {text.noTodos}
                    </p>
                  ) : visibleTodos.length === 0 ? (
                    <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                      {text.noTodosForCategory}
                    </p>
                  ) : (
                    visibleTodos.map((todo) => {
                      const isEditingTodo = editingTodoId === todo.id;
                      const isDelayedTodo = isTodoDelayed(todo);

                      return (
                      <div
                        key={todo.id}
                        data-reorder-card
                        data-reorder-kind="todo"
                        data-reorder-id={todo.id}
                        className={`relative grid overflow-hidden ${
                          isEditingTodo ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                        } items-center gap-2 rounded-md border p-3 transition-all duration-500 sm:gap-3 ${
                          highlightedTodoId === todo.id
                            ? "border-emerald-500 bg-emerald-100 shadow-sm"
                            : todoDropTargetId === todo.id && draggingTodoId !== todo.id
                              ? "border-emerald-500 bg-white shadow-sm"
                            : draggingTodoId === todo.id
                                ? "border-stone-400 bg-white opacity-90 shadow-sm"
                            : isDelayedTodo
                              ? "border-red-200 bg-red-50/70"
                              : "border-stone-200 bg-white"
                        }`}
                      >
                        {isDelayedTodo && !isEditingTodo && (
                          <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-right text-lg font-black tracking-wide text-red-700/15 sm:text-2xl">
                            DELAYED
                          </div>
                        )}
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => toggleTodoItem(todo)}
                          disabled={isSaving || isEditingTodo}
                          aria-label={`Toggle ${todo.title}`}
                          className="relative h-5 w-5 rounded border-stone-300 accent-emerald-700 disabled:cursor-wait"
                        />
                        <div className="relative min-w-0">
                          {isEditingTodo ? (
                            <div className="grid min-w-0 gap-2">
                              <textarea
                                value={editingTodoTitle}
                                onChange={(event) => setEditingTodoTitle(event.target.value)}
                                autoFocus
                                rows={getTodoEditRows(editingTodoTitle)}
                                className="w-full resize-none overflow-hidden rounded-md border border-stone-300 px-2 py-1 text-sm font-medium text-stone-900 outline-none focus:border-emerald-600"
                                aria-label={`Edit ${todo.title}`}
                              />
                              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-stone-500">
                                <span>{text.target}:</span>
                                <input
                                  type="date"
                                  value={editingTodoTargetDate}
                                  onChange={(event) => setEditingTodoTargetDate(event.target.value)}
                                  className="h-6 rounded border border-stone-300 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-emerald-600"
                                  aria-label={`Edit target date for ${todo.title}`}
                                />
                                <span>· {getTodoTargetTiming(editingTodoTargetDate, language)}</span>
                              </div>
                              <label className="grid gap-1 text-xs font-medium text-stone-500">
                                {text.category}
                                <input
                                  value={editingTodoCategory}
                                  onChange={(event) => setEditingTodoCategory(event.target.value)}
                                  className="h-8 rounded-md border border-stone-300 bg-white px-2 text-sm font-normal text-stone-900 outline-none focus:border-emerald-600"
                                  aria-label={`Edit category for ${todo.title}`}
                                  placeholder={text.category}
                                />
                              </label>
                              <div className="flex flex-wrap justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => saveTodoTitle(todo)}
                                  disabled={isSaving || !editingTodoTitle.trim() || !editingTodoTargetDate.trim()}
                                  className="flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {text.saveTitle}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingTodo}
                                  disabled={isSaving}
                                  className="flex h-8 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {text.cancel}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`break-words text-sm font-medium ${
                                todo.completed ? "text-stone-500 line-through" : "text-stone-900"
                              }`}
                            >
                              {todo.title}
                            </div>
                          )}
                          {!isEditingTodo && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                              {todo.category.trim() && (
                                <span className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-medium text-stone-700">
                                  {todo.category.trim() || text.noCategory}
                                </span>
                              )}
                              <span>{getTodoTargetStatus(todo.targetDate, language)}</span>
                            </div>
                          )}
                        </div>
                        {!isEditingTodo && (
                          <div className="relative flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
                            <button
                              type="button"
                              aria-label={`Delete ${todo.title}`}
                              title="Delete"
                              onClick={() => setTodoToDelete(todo)}
                              disabled={isSaving || editingTodoId !== null}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <BinIcon />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit ${todo.title}`}
                              title="Edit"
                              onClick={() => startEditingTodo(todo)}
                              disabled={isSaving || editingTodoId !== null}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                            >
                              <EditIcon />
                            </button>
                          </div>
                        )}
                        <ReorderHandle
                          disabled={isSaving || editingTodoId !== null}
                          label={`Drag ${todo.title} to reorder`}
                          onPointerDown={(event) => startTodoDrag(event, todo.id)}
                        />
                      </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className={currentView === "routine" ? "" : "hidden"}>
                <RoutineTracker
                language={language}
                isSaving={isSaving}
                resetSignal={routineListResetKey}
                reloadSignal={routineReloadKey}
                onSavingChange={setIsSaving}
                onError={setError}
              />
            </div>

            <div
              className={`border border-transparent bg-transparent p-0 ${
                currentView === "archive" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ArchiveIcon />
                  {text.archive}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{archivedItemCount}</span>
                  <button
                    type="button"
                    aria-expanded={currentView === "archive"}
                    aria-label={text.archive}
                    onClick={() => setCurrentView("archive")}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <ArchiveIcon />
                  </button>
                </div>
              </div>
              {currentView === "archive" && (
              <div data-screen-swipe-surface className="max-h-[32rem] touch-pan-y space-y-4 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {archivedItemCount === 0 ? (
                  <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                    {text.archivedEmpty}
                  </p>
                ) : (
                  <>
                    <ArchiveGroup title={text.goalList} count={archivedGoals.length}>
                      {archivedGoals.map((goal) => {
                        const latest = getLatestEntry(goal.entries)?.value ?? 0;
                        return (
                          <StoredItemCard
                            key={goal.id}
                            title={goal.title}
                            meta={`${text.archived}: ${goal.archivedAt ? formatDate(goal.archivedAt) : text.unknown}`}
                            detail={`${text.lastProgress}: ${latest} / ${goal.target} ${goal.unit}`}
                            isSaving={isSaving}
                            onRestore={() => restoreGoal(goal.id)}
                            onDelete={() => deleteGoal(goal.id)}
                            restoreLabel={text.restore}
                            deleteLabel={text.moveToBin}
                          />
                        );
                      })}
                    </ArchiveGroup>
                    <ArchiveGroup title={text.todoList} count={archivedTodos.length}>
                      {archivedTodos.map((todo) => (
                        <StoredItemCard
                          key={todo.id}
                          title={todo.title}
                          meta={`${text.archived}: ${todo.archivedAt ? formatDate(todo.archivedAt) : text.unknown}`}
                          detail={`${todo.completed ? text.completed : text.notCompleted} · ${getTodoTargetStatus(todo.targetDate, language)}${
                            todo.category.trim() ? ` · ${text.category}: ${todo.category}` : ""
                          }`}
                          isSaving={isSaving}
                          onRestore={() => restoreTodo(todo.id)}
                          restoreLabel={text.restore}
                        />
                      ))}
                    </ArchiveGroup>
                    <ArchiveGroup title={text.routineList} count={archivedRoutines.length}>
                      {archivedRoutines.map((routine) => (
                        <StoredItemCard
                          key={routine.id}
                          title={routine.title}
                          meta={`${text.archived}: ${routine.archivedAt ? formatDate(routine.archivedAt) : text.unknown}`}
                          detail={`${routine.startDate} - ${routine.endDate}`}
                          isSaving={isSaving}
                          onRestore={() => restoreRoutine(routine.id)}
                          restoreLabel={text.restore}
                        />
                      ))}
                    </ArchiveGroup>
                  </>
                )}
              </div>
              )}
            </div>

            <div
              className={`border border-transparent bg-transparent p-0 ${
                currentView === "bin" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <BinIcon />
                  {text.bin}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{deletedItemCount}</span>
                  <button
                    type="button"
                    onClick={() => setIsEmptyBinModalOpen(true)}
                    disabled={isSaving || deletedItemCount === 0}
                    className="flex h-8 shrink-0 items-center justify-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {text.empty}
                  </button>
                  <button
                    type="button"
                    aria-expanded={currentView === "bin"}
                    aria-label={text.bin}
                    onClick={() => setCurrentView("bin")}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <BinIcon />
                  </button>
                </div>
              </div>
              {currentView === "bin" && (
              <div data-screen-swipe-surface className="max-h-[32rem] touch-pan-y space-y-4 overflow-auto">
                {deletedItemCount === 0 ? (
                  <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                    {text.deletedEmpty}
                  </p>
                ) : (
                  <>
                    <ArchiveGroup title={text.goalList} count={deletedGoals.length}>
                      {deletedGoals.map((goal) => {
                        const latest = getLatestEntry(goal.entries)?.value ?? 0;
                        return (
                          <StoredItemCard
                            key={goal.id}
                            title={goal.title}
                            meta={`${text.deleted}: ${goal.deletedAt ? formatDate(goal.deletedAt) : text.unknown}`}
                            detail={`${text.lastProgress}: ${latest} / ${goal.target} ${goal.unit}`}
                            isSaving={isSaving}
                            onRestore={() => restoreGoal(goal.id)}
                            onDelete={() => permanentlyDeleteGoal(goal.id)}
                            restoreLabel={text.restore}
                            deleteLabel={text.deleteForever}
                          />
                        );
                      })}
                    </ArchiveGroup>
                    <ArchiveGroup title={text.todoList} count={deletedTodos.length}>
                      {deletedTodos.map((todo) => (
                        <StoredItemCard
                          key={todo.id}
                          title={todo.title}
                          meta={`${text.deleted}: ${todo.deletedAt ? formatDate(todo.deletedAt) : text.unknown}`}
                          detail={`${todo.completed ? text.completed : text.notCompleted} · ${getTodoTargetStatus(todo.targetDate, language)}${
                            todo.category.trim() ? ` · ${text.category}: ${todo.category}` : ""
                          }`}
                          isSaving={isSaving}
                          onRestore={() => restoreTodo(todo.id)}
                          onDelete={() => permanentlyDeleteTodo(todo.id)}
                          restoreLabel={text.restore}
                          deleteLabel={text.deleteForever}
                        />
                      ))}
                    </ArchiveGroup>
                    <ArchiveGroup title={text.routineList} count={deletedRoutines.length}>
                      {deletedRoutines.map((routine) => (
                        <StoredItemCard
                          key={routine.id}
                          title={routine.title}
                          meta={`${text.deleted}: ${routine.deletedAt ? formatDate(routine.deletedAt) : text.unknown}`}
                          detail={`${routine.startDate} - ${routine.endDate}`}
                          isSaving={isSaving}
                          onRestore={() => restoreRoutine(routine.id)}
                          onDelete={() => permanentlyDeleteRoutine(routine.id)}
                          restoreLabel={text.restore}
                          deleteLabel={text.deleteForever}
                        />
                      ))}
                    </ArchiveGroup>
                  </>
                )}
              </div>
              )}
            </div>
          </aside>

          <section className={`min-w-0 max-w-full ${currentView === "detail" ? "" : "hidden"}`}>
            {activeGoal ? (
              <div className="grid min-w-0 gap-0">
                <div className="min-w-0 border border-transparent bg-transparent p-0">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      {isEditingGoal ? (
                        <input
                          value={activeGoalDraft?.title ?? ""}
                          onChange={(event) =>
                            setGoalDraft((draft) =>
                              draft
                                ? { ...draft, title: event.target.value }
                                : { ...toGoalDraft(activeGoal), title: event.target.value },
                            )
                          }
                          className="w-full rounded-md border border-stone-300 px-2 py-1 text-2xl font-semibold outline-none focus:border-emerald-600"
                        />
                      ) : (
                        <h2 className="break-words py-1 text-2xl font-semibold">{activeGoal.title}</h2>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-stone-600">
                        <span className="inline-flex items-center gap-1">
                          {text.start}:{" "}
                          {isEditingGoal ? (
                            <input
                              type="date"
                              value={activeGoalDraft?.startDate ?? ""}
                              onChange={(event) =>
                                setGoalDraft((draft) =>
                                  draft
                                    ? { ...draft, startDate: event.target.value }
                                    : { ...toGoalDraft(activeGoal), startDate: event.target.value },
                                )
                              }
                              className="h-6 w-[8.5rem] rounded border border-stone-300 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-emerald-600"
                              aria-label="Edit goal start date"
                            />
                          ) : (
                            formatDate(activeGoal.createdAt)
                          )}
                        </span>
                        <span>{text.latest}: {latestEntry ? formatDate(latestEntry.createdAt) : text.none}</span>
                        <span className="inline-flex items-center gap-1">
                          {text.deadline}:{" "}
                          {isEditingGoal ? (
                            <input
                              type="date"
                              value={activeGoalDraft?.deadline ?? ""}
                              onChange={(event) =>
                                setGoalDraft((draft) =>
                                  draft
                                    ? { ...draft, deadline: event.target.value }
                                    : { ...toGoalDraft(activeGoal), deadline: event.target.value },
                                )
                              }
                              className="h-6 w-[8.5rem] rounded border border-stone-300 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-emerald-600"
                              aria-label="Edit goal deadline"
                            />
                          ) : (
                            activeGoal.deadline || text.notSet
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isEditingGoal ? (
                    <div className="mt-5 grid gap-4">
                      <label className="grid gap-1 text-sm font-medium">
                        {text.memo}
                        <textarea
                          ref={goalMemoTextareaRef}
                          value={activeGoalDraft?.memo ?? ""}
                          onChange={(event) =>
                            setGoalDraft((draft) =>
                              draft
                                ? { ...draft, memo: event.target.value }
                                : { ...toGoalDraft(activeGoal), memo: event.target.value },
                            )
                          }
                          className="min-h-24 resize-y overflow-hidden rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                          placeholder="Describe the final goal or why it matters."
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium text-stone-500">{text.current}</span>{" "}
                          <span className="font-semibold text-stone-900">{latestValue}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-stone-500">{text.target}</span>{" "}
                          <input
                            type="number"
                            min={1}
                            value={activeGoalDraft?.target ?? ""}
                            onChange={(event) =>
                              setGoalDraft((draft) =>
                                draft
                                  ? { ...draft, target: event.target.value }
                                  : { ...toGoalDraft(activeGoal), target: event.target.value },
                              )
                            }
                            className="h-6 w-16 rounded border border-stone-300 bg-white px-1.5 text-sm font-semibold text-stone-900 outline-none focus:border-emerald-600"
                            aria-label="Edit goal target"
                          />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium text-stone-500">{text.unit}</span>{" "}
                          <input
                            value={activeGoalDraft?.unit ?? ""}
                            onChange={(event) =>
                              setGoalDraft((draft) =>
                                draft
                                  ? { ...draft, unit: event.target.value }
                                  : { ...toGoalDraft(activeGoal), unit: event.target.value },
                              )
                            }
                            className="h-6 w-20 rounded border border-stone-300 bg-white px-1.5 text-sm font-semibold text-stone-900 outline-none focus:border-emerald-600"
                            aria-label="Edit goal unit"
                          />
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">{text.progress}</span>{" "}
                          <span className="font-semibold text-emerald-700">{progressPercent}%</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4">
                      <div className="rounded-md border border-stone-200 bg-white p-3">
                        <div className="text-xs font-medium text-stone-500">{text.memo}</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{activeGoal.memo || text.noMemo}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium text-stone-500">{text.current}</span>{" "}
                          <span className="font-semibold text-stone-900">{latestValue}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">{text.target}</span>{" "}
                          <span className="font-semibold text-stone-900">{activeGoal.target}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">{text.unit}</span>{" "}
                          <span className="font-semibold text-stone-900">{activeGoal.unit}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">{text.progress}</span>{" "}
                          <span className="font-semibold text-emerald-700">{progressPercent}%</span>
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex w-full flex-wrap justify-end gap-2">
                    {isEditingGoal ? (
                      <>
                        <button
                          type="button"
                          aria-label="Done editing goal"
                          title="Done"
                          onClick={finishEditingGoal}
                          disabled={isSaving}
                          className="flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                        >
                          {text.save}
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel editing goal"
                          title={text.cancel}
                          onClick={cancelEditingGoal}
                          disabled={isSaving}
                          className="flex h-8 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          {text.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label="Back to list"
                          title="Back to list"
                          onClick={() => {
                            if (activeGoal) setGoalDraft(toGoalDraft(activeGoal));
                            setIsEditingGoal(false);
                            setIsEntryModalOpen(false);
                            setCurrentView("list");
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                        >
                          <BackToListIcon />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${activeGoal.title}`}
                          title="Delete"
                          onClick={() => deleteGoal(activeGoal.id)}
                          disabled={isSaving}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          <BinIcon />
                        </button>
                        <button
                          type="button"
                          aria-label={`Archive ${activeGoal.title}`}
                          title="Archive"
                          onClick={() => archiveGoal(activeGoal.id)}
                          disabled={isSaving}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          <ArchiveIcon />
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${activeGoal.title}`}
                          title="Edit"
                          onClick={() => {
                            setGoalDraft(toGoalDraft(activeGoal));
                            setIsEditingGoal(true);
                          }}
                          disabled={isSaving}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          <EditIcon />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full bg-emerald-700 transition-all"
                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="grid min-w-0 gap-0">
                    <div className="min-w-0 border border-transparent bg-transparent p-0">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold">{text.progressChart}</h2>
                          <p className="text-sm text-stone-600">{text.progressChartHint}</p>
                        </div>
                        <button
                          type="button"
                          aria-label="Add progress record"
                          onClick={() => {
                            setEntryRecordedAt(toDateInputValue());
                            setIsEntryModalOpen(true);
                          }}
                          disabled={isSaving}
                          className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          {text.add}
                        </button>
                      </div>
                      <ProgressChart
                        entries={activeGoal.entries}
                        target={activeGoal.target}
                        unit={activeGoal.unit}
                        deadline={activeGoal.deadline}
                      />
                    </div>

                    <div className="min-w-0 border border-transparent bg-transparent p-0">
                      <h2 className="text-base font-semibold">{text.recordHistory}</h2>
                      <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                        {activeGoal.entries.length === 0 ? (
                          <p className="rounded-md border border-stone-200 bg-white px-3 py-4 text-sm text-stone-600">
                            {text.noRecords}
                          </p>
                        ) : (
                          activeGoal.entries
                            .slice()
                            .sort((a, b) => b.createdAt - a.createdAt)
                            .map((entry) =>
                              editingEntryId === entry.id ? (
                                <div key={entry.id} className="grid gap-3 rounded-md border border-emerald-300 bg-white p-3">
                                  <div className="grid gap-3 md:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                                    <label className="grid min-w-0 gap-1 text-sm font-medium">
                                      Value
                                      <input
                                        type="number"
                                        min={0}
                                        value={editEntryValue}
                                        onChange={(event) => setEditEntryValue(Number(event.target.value))}
                                        className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                                      />
                                    </label>
                                    <label className="grid min-w-0 gap-1 text-sm font-medium">
                                      Date
                                      <input
                                        type="date"
                                        value={editEntryRecordedAt}
                                        onChange={(event) => setEditEntryRecordedAt(event.target.value)}
                                        className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                                      />
                                    </label>
                                  </div>
                                  <label className="grid gap-1 text-sm font-medium">
                                    {text.memo}
                                    <textarea
                                      value={editEntryMemo}
                                      onChange={(event) => setEditEntryMemo(event.target.value)}
                                      className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                                    />
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      aria-label="Save progress record"
                                      title={text.saveTitle}
                                      onClick={() => updateEntryRecord(entry.id)}
                                      disabled={isSaving}
                                      className="flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      {text.save}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Cancel editing progress record"
                                      title={text.cancel}
                                      onClick={() => setEditingEntryId(null)}
                                      disabled={isSaving}
                                      className="flex h-8 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      {text.cancel}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Delete progress record"
                                      title="Delete"
                                      onClick={() => deleteEntryRecord(entry.id)}
                                      disabled={isSaving}
                                      className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      <BinIcon />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={entry.id}
                                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-stone-200 bg-white p-3 text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold">
                                      {entry.value} {activeGoal.unit}
                                    </div>
                                    <div className="text-xs text-stone-500">{formatDate(entry.createdAt)}</div>
                                    <p className="mt-2 min-w-0 whitespace-pre-wrap break-words text-sm text-stone-700">
                                      {entry.memo || "No memo"}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label="Edit progress record"
                                    title="Edit"
                                    onClick={() => startEditingEntry(entry)}
                                    disabled={isSaving}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    <EditIcon />
                                  </button>
                                </div>
                              ),
                            )
                        )}
                      </div>
                    </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center border border-transparent bg-transparent p-0 text-center">
                <div>
                  <h2 className="text-xl font-semibold">Add a goal to begin</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    Set a measurable target and deadline, then record progress over time.
                  </p>
                </div>
              </div>
            )}
          </section>
        </section>

        {isEntryModalOpen && activeGoal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
            <section className="w-full max-w-lg rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{text.addProgressRecord}</h2>
                <button
                  type="button"
                  aria-label="Close add progress record"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  {text.current}
                  <input
                    type="number"
                    min={0}
                    value={entryValue}
                    onChange={(event) => setEntryValue(Number(event.target.value))}
                    className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(activeGoal.target, entryValue, 1)}
                  value={entryValue}
                  onChange={(event) => setEntryValue(Number(event.target.value))}
                  className="w-full accent-emerald-700"
                />
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  Record date
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      type="date"
                      value={entryRecordedAt}
                      onChange={(event) => setEntryRecordedAt(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => setEntryRecordedAt(toDateInputValue())}
                      className="w-full rounded-md border border-stone-300 px-3 py-2 font-normal text-stone-700 hover:bg-stone-100 sm:w-auto"
                    >
                      Today
                    </button>
                  </div>
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  {text.memo}
                  <textarea
                    value={entryMemo}
                    onChange={(event) => setEntryMemo(event.target.value)}
                    className="min-h-24 w-full min-w-0 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    placeholder="What changed since the last record?"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEntryModalOpen(false)}
                    disabled={isSaving}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    {text.close}
                  </button>
                  <button
                    type="button"
                    onClick={addEntry}
                    disabled={isSaving}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {text.saveTitle}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

          </div>
          {screenSwipeTargetView && screenSwipeTargetDirection && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 min-w-0 transform-gpu ${
                isScreenSwipeAnimating ? "transition-transform duration-[260ms] ease-out" : ""
              }`}
              style={{
                transform: `translateX(calc(${screenSwipeOffset}px + ${
                  screenSwipeTargetDirection === -1 ? "100%" : "-100%"
                }))`,
              }}
            >
              <div className="rounded-full border border-stone-300 bg-white/95 p-1 shadow-sm backdrop-blur">
                <div className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white">
                  {screenSwipeTargetView === "list" && <ListIcon />}
                  {screenSwipeTargetView === "todo" && <TodoIcon />}
                  {screenSwipeTargetView === "routine" && <RoutineIcon />}
                  {screenSwipeTargetView === "archive" && <ArchiveIcon />}
                  {screenSwipeTargetView === "bin" && <BinIcon />}
                  {screenSwipeTargetView === "user" && <UserIcon />}
                  <span>{getTrackerViewLabel(screenSwipeTargetView, language)}</span>
                </div>
              </div>

              <section className="mt-0 min-w-0">
                <div className="border border-transparent bg-transparent p-0">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    {screenSwipeTargetView === "list" && <ListIcon />}
                    {screenSwipeTargetView === "todo" && <TodoIcon />}
                    {screenSwipeTargetView === "routine" && <RoutineIcon />}
                    {screenSwipeTargetView === "archive" && <ArchiveIcon />}
                    {screenSwipeTargetView === "bin" && <BinIcon />}
                    {screenSwipeTargetView === "user" && <UserIcon />}
                    {getTrackerViewLabel(screenSwipeTargetView, language)}
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-14 rounded-md bg-stone-100" />
                    <div className="h-14 rounded-md bg-stone-100" />
                    <div className="h-14 rounded-md bg-stone-100" />
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      {typeof document !== "undefined" && isGoalModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-950/40">
          <section className="fixed left-1/2 top-1/2 w-[calc(100dvw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{text.addGoal}</h2>
              <button
                type="button"
                aria-label="Close add goal"
                onClick={() => setIsGoalModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                {text.goalName}
                <input
                  value={goalForm.title}
                  onChange={(event) => setGoalForm((form) => ({ ...form, title: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && addGoal()}
                  autoFocus
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  placeholder="Example: TOEIC 900"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {text.goalMemo}
                <textarea
                  value={goalForm.memo}
                  onChange={(event) => setGoalForm((form) => ({ ...form, memo: event.target.value }))}
                  className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  placeholder="Describe the final goal or why it matters."
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,96px)]">
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  {text.target}
                  <input
                    type="number"
                    min={1}
                    value={goalForm.target}
                    onChange={(event) => setGoalForm((form) => ({ ...form, target: Number(event.target.value) }))}
                    className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  {text.unit}
                  <input
                    value={goalForm.unit}
                    onChange={(event) => setGoalForm((form) => ({ ...form, unit: event.target.value }))}
                    className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  {text.start}
                  <input
                    type="date"
                    value={goalForm.startDate}
                    onChange={(event) => setGoalForm((form) => ({ ...form, startDate: event.target.value }))}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  {text.deadline}
                  <input
                    type="date"
                    value={goalForm.deadline}
                    onChange={(event) => setGoalForm((form) => ({ ...form, deadline: event.target.value }))}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.close}
                </button>
                <button
                  type="button"
                  onClick={addGoal}
                  disabled={isSaving}
                  className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.add}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {typeof document !== "undefined" && isTodoModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-950/40">
          <section className="fixed left-1/2 top-1/2 w-[calc(100dvw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{text.addTodo}</h2>
              <button
                type="button"
                aria-label="Close add todo"
                onClick={() => setIsTodoModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                {text.todo}
                <input
                  value={todoTitle}
                  onChange={(event) => setTodoTitle(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addTodoItem()}
                  autoFocus
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  placeholder="Write a task"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {text.targetDate}
                <input
                  type="date"
                  value={todoTargetDate}
                  onChange={(event) => setTodoTargetDate(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addTodoItem()}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {text.category}
                <input
                  value={todoCategory}
                  onChange={(event) => setTodoCategory(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addTodoItem()}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  placeholder={text.category}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsTodoModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.close}
                </button>
                <button
                  type="button"
                  onClick={addTodoItem}
                  disabled={isSaving || !todoTitle.trim() || !todoTargetDate.trim()}
                  className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.add}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {typeof document !== "undefined" && todoToDelete && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-950/40">
          <section className="fixed left-1/2 top-1/2 w-[calc(100dvw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{text.delete}?</h2>
              <button
                type="button"
                aria-label="Close delete todo"
                onClick={() => setTodoToDelete(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 rounded-md bg-stone-100 p-3 text-sm text-stone-800">
              {todoToDelete.title}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTodoToDelete(null)}
                disabled={isSaving}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                {text.cancel}
              </button>
              <button
                type="button"
                onClick={() => deleteTodoItem(todoToDelete.id)}
                disabled={isSaving}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
              >
                {text.delete}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {typeof document !== "undefined" && isEmptyBinModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-950/40">
          <section className="fixed left-1/2 top-1/2 w-[calc(100dvw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{text.emptyBinTitle}</h2>
              <button
                type="button"
                aria-label="Close empty bin"
                onClick={() => setIsEmptyBinModalOpen(false)}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 rounded-md bg-stone-100 p-3 text-sm text-stone-800">
              {text.emptyBinConfirm(deletedItemCount)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsEmptyBinModalOpen(false)}
                disabled={isSaving}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                {text.cancel}
              </button>
              <button
                type="button"
                onClick={emptyBin}
                disabled={isSaving || deletedItemCount === 0}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
              >
                {text.emptyBin}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      <nav
        data-swipe-ignore
        className="fixed inset-x-0 bottom-0 z-40 flex gap-0 overflow-x-hidden border-t border-stone-300 bg-white/95 px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(28,25,23,0.12)] backdrop-blur sm:hidden"
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              if (suppressNextNavClick.current) {
                event.preventDefault();
                return;
              }
              navigateToView(item.id as TrackerView);
            }}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-semibold leading-none transition sm:h-10 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-2 sm:text-xs ${
              currentView === item.id
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            {item.id === "list" && <ListIcon />}
            {item.id === "todo" && <TodoIcon />}
            {item.id === "routine" && <RoutineIcon />}
            {item.id === "archive" && <ArchiveIcon />}
            {item.id === "bin" && <BinIcon />}
            <span className="max-w-full truncate whitespace-nowrap sm:hidden">{item.shortLabel}</span>
            <span className="hidden max-w-full truncate whitespace-nowrap sm:inline">{item.label}</span>
            {item.count !== null && (
              <span
                className={`hidden h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] sm:inline-flex ${
                  currentView === item.id ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </main>
  );
}

function ArchiveGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section data-screen-swipe-surface>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <span className="text-xs font-medium text-stone-500">{count}</span>
      </div>
      {count === 0 ? (
        <p className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-stone-600">No items.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function StoredItemCard({
  title,
  meta,
  detail,
  isSaving,
  onRestore,
  onDelete,
  restoreLabel = "Restore",
  deleteLabel,
}: {
  title: string;
  meta: string;
  detail: string;
  isSaving: boolean;
  onRestore: () => void;
  onDelete?: () => void;
  restoreLabel?: string;
  deleteLabel?: string;
}) {
  return (
    <div data-screen-swipe-surface className="rounded-md border border-stone-200 bg-white p-3">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs text-stone-600">{meta}</div>
      <div className="mt-1 text-xs text-stone-600">{detail}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={isSaving}
          className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
        >
          {restoreLabel}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSaving}
            className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {deleteLabel ?? "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#f6f7f4] text-stone-950"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-stone-300 border-t-emerald-700"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-stone-600">Loading data...</p>
      </div>
    </main>
  );
}

function BinIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function ArchiveIcon() {
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
      <path d="M3 4h18v5H3z" />
      <path d="M5 9v11h14V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function EditIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function BackToListIcon() {
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
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
      <path d="m5 3-3 3 3 3" />
    </svg>
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
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function LoginScreen({
  loginId,
  password,
  mode,
  language,
  error,
  isSaving,
  onLoginIdChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
  onSignup,
}: {
  loginId: string;
  password: string;
  mode: "login" | "signup";
  language: AppLanguage;
  error: string;
  isSaving: boolean;
  onLoginIdChange: (loginId: string) => void;
  onPasswordChange: (password: string) => void;
  onModeChange: (mode: "login" | "signup") => void;
  onSubmit: () => void;
  onSignup: () => void;
}) {
  const primaryAction = mode === "login" ? onSubmit : onSignup;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f4] px-2.5 text-stone-950">
      <section className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-emerald-700">PlanTree</p>
            <h1 className="mt-2 text-2xl font-semibold">{mode === "login" ? "Login" : "Sign up"}</h1>
          </div>
          <AppInstallButton language={language} />
        </div>
        <div className="mt-5 grid gap-3">
          <div className="grid grid-cols-2 rounded-md border border-stone-300 bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === "login" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onModeChange("signup")}
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === "signup" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
              }`}
            >
              Sign up
            </button>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Login ID
            <input
              value={loginId}
              onChange={(event) => onLoginIdChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && primaryAction()}
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
              placeholder="my-id"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && primaryAction()}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
              placeholder="At least 8 characters"
            />
          </label>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={primaryAction}
            disabled={isSaving || !loginId.trim() || !password}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Working..." : mode === "login" ? "Login" : "Create ID"}
          </button>
          <a
            href="/api/auth/google"
            className="rounded-md border border-stone-300 px-4 py-2 text-center text-sm font-semibold text-stone-800 hover:bg-stone-100"
          >
            Continue with Google
          </a>
        </div>
      </section>
    </main>
  );
}

function ReorderHandle({
  disabled,
  label,
  onPointerDown,
}: {
  disabled: boolean;
  label: string;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={`grid h-12 w-8 touch-none cursor-grab select-none place-items-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 active:cursor-grabbing ${
        disabled ? "cursor-not-allowed opacity-35" : ""
      }`}
      title="Drag to reorder"
    >
      <span className="grid gap-0.5">
        <ArrowUpIcon />
        <ArrowDownIcon />
      </span>
    </div>
  );
}

function ArrowUpIcon() {
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
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ArrowDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    >
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function TodoIcon() {
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
      <path d="M9 11l2 2 4-4" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function RoutineIcon() {
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
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
