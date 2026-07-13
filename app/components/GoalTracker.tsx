"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProgressChart from "./ProgressChart";

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

type GoalPatch = Partial<Pick<Goal, "title" | "memo" | "target" | "unit" | "deadline">>;

type GoalDraft = {
  goalId: string;
  title: string;
  memo: string;
  target: string;
  unit: string;
  deadline: string;
};

type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};

type TrackerView = "list" | "todo" | "archive" | "trash" | "detail" | "user";

type Session = {
  loginId: string | null;
};

type NavigationState = {
  boostmaster: true;
  view: TrackerView;
  goalId: string | null;
};

const emptyGoalForm = {
  title: "",
  memo: "",
  target: 100,
  unit: "units",
  deadline: "",
};

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

function formatDateTime(ts: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
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

function toDateTimeLocalValue(date = new Date()) {
  const localTime = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localTime).toISOString().slice(0, 16);
}

function parseDateTimeLocalValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function toGoalDraft(goal: Goal): GoalDraft {
  return {
    goalId: goal.id,
    title: goal.title,
    memo: goal.memo,
    target: String(goal.target),
    unit: goal.unit,
    deadline: goal.deadline,
  };
}

function moveByIndex<T>(items: T[], fromIndex: number, offset: -1 | 1) {
  const toIndex = fromIndex + offset;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function makeNavigationState(view: TrackerView, goalId: string | null): NavigationState {
  return {
    boostmaster: true,
    view,
    goalId: view === "detail" ? goalId : null,
  };
}

function isNavigationState(value: unknown): value is NavigationState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.boostmaster === true &&
    typeof record.view === "string" &&
    ["list", "todo", "archive", "trash", "detail", "user"].includes(record.view)
  );
}

function navigationKey(state: NavigationState) {
  return `${state.view}:${state.goalId ?? ""}`;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

async function fetchGoals() {
  const response = await fetch("/api/goals", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load goals");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchDeletedGoals() {
  const response = await fetch("/api/goals/trash", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load trash");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function fetchArchivedGoals() {
  const response = await fetch("/api/goals/archive", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; goals?: Goal[] };
  if (!response.ok) throw new Error(data.error || "Failed to load archive");
  return Array.isArray(data.goals) ? data.goals : [];
}

async function createGoal(input: typeof emptyGoalForm) {
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

async function createTodo(title: string) {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
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

async function patchTodo(todoId: string, patch: Partial<Pick<Todo, "title" | "completed">>) {
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
  const data = (await response.json()) as { error?: string; todos?: Todo[] };
  if (!response.ok) throw new Error(data.error || "Failed to delete todo");
  return Array.isArray(data.todos) ? data.todos : [];
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
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<TrackerView>("list");
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [todoToDelete, setTodoToDelete] = useState<Todo | null>(null);
  const [highlightedGoalId, setHighlightedGoalId] = useState<string | null>(null);
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState(emptyGoalForm);
  const [todoTitle, setTodoTitle] = useState("");
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [entryValue, setEntryValue] = useState(0);
  const [entryMemo, setEntryMemo] = useState("");
  const [entryRecordedAt, setEntryRecordedAt] = useState(() => toDateTimeLocalValue());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryValue, setEditEntryValue] = useState(0);
  const [editEntryMemo, setEditEntryMemo] = useState("");
  const [editEntryRecordedAt, setEditEntryRecordedAt] = useState(() => toDateTimeLocalValue());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
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
        const [loadedGoals, loadedDeletedGoals, loadedArchivedGoals] = await Promise.all([
          fetchGoals(),
          fetchDeletedGoals(),
          fetchArchivedGoals(),
        ]);
        const firstGoal = loadedGoals[0] ?? null;
        const firstLatestEntry = firstGoal ? getLatestEntry(firstGoal.entries) : null;
        if (!isActive) return;
        setGoals(loadedGoals);
        setDeletedGoals(loadedDeletedGoals);
        setArchivedGoals(loadedArchivedGoals);
        setActiveGoalId(firstGoal?.id ?? null);
        setIsEditingGoal(false);
        setGoalDraft(firstGoal ? toGoalDraft(firstGoal) : null);
        setEntryValue(firstLatestEntry?.value ?? 0);

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
    };
  }, []);

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
      setTodoToDelete(null);
    }

    window.addEventListener("popstate", applyBrowserNavigation);
    return () => window.removeEventListener("popstate", applyBrowserNavigation);
  }, [goals]);

  useEffect(() => {
    if (!loginId || isLoading) return;

    const state = makeNavigationState(currentView, activeGoalId);
    const key = navigationKey(state);

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

  function resetGoalState() {
    hasNavigationState.current = false;
    isApplyingBrowserNavigation.current = false;
    lastNavigationKey.current = "";
    previousView.current = "list";
    setGoals([]);
    setDeletedGoals([]);
    setArchivedGoals([]);
    setTodos([]);
    setActiveGoalId(null);
    setCurrentView("list");
    setIsEditingGoal(false);
    setIsGoalModalOpen(false);
    setIsTodoModalOpen(false);
    setIsEntryModalOpen(false);
    setTodoToDelete(null);
    setHighlightedGoalId(null);
    setHighlightedTodoId(null);
    setTodoTitle("");
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
    const [loadedGoals, loadedDeletedGoals, loadedArchivedGoals] = await Promise.all([
      fetchGoals(),
      fetchDeletedGoals(),
      fetchArchivedGoals(),
    ]);
    applyLoadedGoals(loadedGoals, loadedDeletedGoals, loadedArchivedGoals);

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
      setEntryRecordedAt(toDateTimeLocalValue());
      setEditingEntryId(null);
      setGoalForm(emptyGoalForm);
      setIsGoalModalOpen(false);
      setCurrentView("detail");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add goal");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveGoalItem(goalId: string, offset: -1 | 1) {
    const fromIndex = goals.findIndex((goal) => goal.id === goalId);
    const nextGoals = moveByIndex(goals, fromIndex, offset);
    if (nextGoals === goals) return;

    const previousGoals = goals;
    setGoals(nextGoals);
    flashMovedItem("goal", goalId);
    setIsSaving(true);
    setError("");

    try {
      setGoals(await reorderGoalList(nextGoals.map((goal) => goal.id)));
    } catch (reorderError) {
      setGoals(previousGoals);
      setHighlightedGoalId(null);
      setError(reorderError instanceof Error ? reorderError.message : "Failed to reorder goals");
    } finally {
      setIsSaving(false);
    }
  }

  async function addTodoItem() {
    const title = todoTitle.trim();
    if (!title || !loginId) return;

    setIsSaving(true);
    setError("");

    try {
      const result = await createTodo(title);
      setTodos(result.todos);
      setTodoTitle("");
      setIsTodoModalOpen(false);
      setCurrentView("todo");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add todo");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveTodoItem(todoId: string, offset: -1 | 1) {
    const fromIndex = todos.findIndex((todo) => todo.id === todoId);
    const nextTodos = moveByIndex(todos, fromIndex, offset);
    if (nextTodos === todos) return;

    const previousTodos = todos;
    setTodos(nextTodos);
    flashMovedItem("todo", todoId);
    setIsSaving(true);
    setError("");

    try {
      setTodos(await reorderTodoList(nextTodos.map((todo) => todo.id)));
    } catch (reorderError) {
      setTodos(previousTodos);
      setHighlightedTodoId(null);
      setError(reorderError instanceof Error ? reorderError.message : "Failed to reorder todos");
    } finally {
      setIsSaving(false);
    }
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
      setTodos(await removeTodo(todoId));
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
    }
  }

  function finishEditingGoal() {
    if (!activeGoal || !activeGoalDraft) return;
    commitGoalDraft("title", activeGoalDraft.title);
    commitGoalDraft("memo", activeGoalDraft.memo);
    commitGoalDraft("target", activeGoalDraft.target);
    commitGoalDraft("unit", activeGoalDraft.unit);
    commitGoalDraft("deadline", activeGoalDraft.deadline);
    setIsEditingGoal(false);
  }

  function cancelEditingGoal() {
    if (activeGoal) setGoalDraft(toGoalDraft(activeGoal));
    setIsEditingGoal(false);
  }

  async function addEntry() {
    if (!activeGoal || !Number.isFinite(entryValue)) return;

    setIsSaving(true);
    setError("");

    try {
      const savedGoals = await createEntry(activeGoal.id, {
        value: Math.max(0, entryValue),
        memo: entryMemo.trim(),
        createdAt: parseDateTimeLocalValue(entryRecordedAt),
      });
      setGoals(savedGoals);
      setEntryMemo("");
      setEntryRecordedAt(toDateTimeLocalValue());
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
      setCurrentView("trash");
    }
    setGoals(nextGoals);
    setCurrentView("trash");
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
      setEntryRecordedAt(toDateTimeLocalValue());
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

  function selectGoal(goal: Goal) {
    const goalLatestEntry = getLatestEntry(goal.entries);
    flashMovedItem("goal", goal.id);
    setActiveGoalId(goal.id);
    setCurrentView("detail");
    setIsEditingGoal(false);
    setGoalDraft(toGoalDraft(goal));
    setEntryValue(goalLatestEntry?.value ?? 0);
    setEntryMemo("");
    setEntryRecordedAt(toDateTimeLocalValue());
    setEditingEntryId(null);
    setIsEntryModalOpen(false);
  }

  function startEditingEntry(entry: ProgressEntry) {
    setEditingEntryId(entry.id);
    setEditEntryValue(entry.value);
    setEditEntryMemo(entry.memo);
    setEditEntryRecordedAt(toDateTimeLocalValue(new Date(entry.createdAt)));
    setError("");
  }

  async function updateEntryRecord(entryId: string) {
    if (!activeGoal || !Number.isFinite(editEntryValue)) return;

    setIsSaving(true);
    setError("");

    try {
      const savedGoals = await patchEntry(activeGoal.id, entryId, {
        value: Math.max(0, editEntryValue),
        memo: editEntryMemo.trim(),
        createdAt: parseDateTimeLocalValue(editEntryRecordedAt),
      });
      setGoals(savedGoals);
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
    <main className="min-h-screen bg-[#f6f7f4] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-end justify-between gap-4 border-b border-stone-300 pb-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-700">Master plan for everything</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
              Goal Tracker
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Go back"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-100"
            >
              <ArrowLeftIcon />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              aria-label="Go forward"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-100"
            >
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView("user");
                setIsEditingGoal(false);
                setIsGoalModalOpen(false);
                setIsTodoModalOpen(false);
                setIsEntryModalOpen(false);
                setTodoToDelete(null);
              }}
              aria-label="Open user page"
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition ${
                currentView === "user"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              <UserIcon />
            </button>
          </div>
        </header>

        {(error || isSaving || isLoading) && (
          <div className="rounded-md border border-stone-300 bg-white px-4 py-3 text-sm shadow-sm">
            {isLoading ? "Loading local DB..." : isSaving ? "Saving to local DB..." : error}
          </div>
        )}

        <nav className="sticky top-0 z-40 grid grid-cols-4 gap-1 rounded-full border border-stone-300 bg-white/95 p-1 shadow-sm backdrop-blur">
          {[
            { id: "list", label: "Goal list", shortLabel: "Goals", count: goals.length },
            { id: "todo", label: "To do list", shortLabel: "To do", count: todos.length },
            { id: "archive", label: "Archive", shortLabel: "Archive", count: archivedGoals.length },
            { id: "trash", label: "휴지통", shortLabel: "Trash", count: deletedGoals.length },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCurrentView(item.id as TrackerView);
                setIsEditingGoal(false);
                setIsAccountDeleteOpen(false);
                setIsGoalModalOpen(false);
                setIsTodoModalOpen(false);
                setIsEntryModalOpen(false);
                setTodoToDelete(null);
              }}
              className={`flex h-10 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-semibold transition sm:gap-2 sm:px-3 sm:text-sm ${
                currentView === item.id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              {item.id === "list" && <ListIcon />}
              {item.id === "todo" && <TodoIcon />}
              {item.id === "archive" && <ArchiveIcon />}
              {item.id === "trash" && <TrashIcon />}
              <span className="min-w-0 truncate sm:hidden">{item.shortLabel}</span>
              <span className="hidden min-w-0 truncate sm:inline">{item.label}</span>
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

        <section className={`min-w-0 ${currentView === "user" ? "grid gap-4" : "hidden"}`}>
          <div className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <UserIcon />
                  User
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">Login ID</dt>
                    <dd className="mt-1 font-semibold">{loginId}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">Active goals</dt>
                    <dd className="mt-1 font-semibold">{goals.length}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">Archived</dt>
                    <dd className="mt-1 font-semibold">{archivedGoals.length}</dd>
                  </div>
                  <div className="rounded-md bg-stone-100 p-3">
                    <dt className="text-xs font-medium text-stone-500">Trash</dt>
                    <dd className="mt-1 font-semibold">{deletedGoals.length}</dd>
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
          <section className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
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
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="min-w-0">
          <aside className={`min-w-0 flex-col gap-4 ${currentView === "detail" || currentView === "user" ? "hidden" : "flex"}`}>
            <div
              className={`rounded-lg border border-stone-300 bg-white p-3 shadow-sm ${
                currentView === "list" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="text-base font-semibold">Goal list</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{goals.length}</span>
                  <button
                    type="button"
                    aria-expanded={isGoalModalOpen}
                    aria-label="Add goal"
                    onClick={() => {
                      setCurrentView("list");
                      setIsGoalModalOpen(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <AddIcon />
                  </button>
                </div>
              </div>
              {currentView === "list" && (
                <div className="space-y-2">
                  {goals.length === 0 ? (
                    <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                      No goals yet. Add the first goal to start tracking.
                    </p>
                  ) : (
                    goals.map((goal, index) => {
                      const latest = getLatestEntry(goal.entries)?.value ?? 0;
                      const percent = Math.min(100, clampProgress(latest, goal.target));

                      return (
                        <div
                          key={goal.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectGoal(goal)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectGoal(goal);
                            }
                          }}
                          className={`w-full cursor-pointer rounded-md border p-3 text-left transition-all duration-500 ${
                            highlightedGoalId === goal.id
                              ? "border-emerald-500 bg-emerald-100 shadow-sm"
                              : "border-stone-200 bg-white hover:border-stone-400"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2">
                              <span className="min-w-0 font-medium">{goal.title}</span>
                            </div>
                            <div className="flex shrink-0 items-start gap-2">
                              <span className="pt-1 text-sm text-stone-600">{percent}%</span>
                              <ReorderControls
                                canMoveUp={index > 0}
                                canMoveDown={index < goals.length - 1}
                                disabled={isSaving}
                                upLabel={`Move ${goal.title} up`}
                                downLabel={`Move ${goal.title} down`}
                                onMoveUp={() => moveGoalItem(goal.id, -1)}
                                onMoveDown={() => moveGoalItem(goal.id, 1)}
                              />
                            </div>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                            <div className="h-full bg-emerald-700" style={{ width: `${percent}%` }} />
                          </div>
                          <div className="mt-2 text-xs text-stone-600">
                            {latest} / {goal.target} {goal.unit}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div
              className={`rounded-lg border border-stone-300 bg-white p-3 shadow-sm ${
                currentView === "todo" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TodoIcon />
                  To do list
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{todos.length}</span>
                  <button
                    type="button"
                    aria-expanded={isTodoModalOpen}
                    aria-label="Add todo"
                    onClick={() => {
                      setCurrentView("todo");
                      setIsTodoModalOpen(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <AddIcon />
                  </button>
                </div>
              </div>
              {currentView === "todo" && (
                <div className="space-y-2">
                  {todos.length === 0 ? (
                    <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                      No todos yet. Add a simple task to keep it on the list.
                    </p>
                  ) : (
                    todos.map((todo, index) => (
                      <div
                        key={todo.id}
                        className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border p-3 transition-all duration-500 sm:gap-3 ${
                          highlightedTodoId === todo.id
                            ? "border-emerald-500 bg-emerald-100 shadow-sm"
                            : "border-stone-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => toggleTodoItem(todo)}
                          disabled={isSaving}
                          aria-label={`Toggle ${todo.title}`}
                          className="h-5 w-5 rounded border-stone-300 accent-emerald-700 disabled:cursor-wait"
                        />
                        <div className="min-w-0">
                          <div
                            className={`break-words text-sm font-medium ${
                              todo.completed ? "text-stone-500 line-through" : "text-stone-900"
                            }`}
                          >
                            {todo.title}
                          </div>
                          <div className="mt-1 text-xs text-stone-500">{formatDateTime(todo.createdAt)}</div>
                        </div>
                        <ReorderControls
                          canMoveUp={index > 0}
                          canMoveDown={index < todos.length - 1}
                          disabled={isSaving}
                          upLabel={`Move ${todo.title} up`}
                          downLabel={`Move ${todo.title} down`}
                          onMoveUp={() => moveTodoItem(todo.id, -1)}
                          onMoveDown={() => moveTodoItem(todo.id, 1)}
                        />
                        <button
                          type="button"
                          onClick={() => setTodoToDelete(todo)}
                          disabled={isSaving}
                          className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:py-2 sm:text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div
              className={`rounded-lg border border-stone-300 bg-white p-3 shadow-sm ${
                currentView === "archive" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ArchiveIcon />
                  Archive
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{archivedGoals.length}</span>
                  <button
                    type="button"
                    aria-expanded={currentView === "archive"}
                    aria-label="Archive"
                    onClick={() => setCurrentView("archive")}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <ArchiveIcon />
                  </button>
                </div>
              </div>
              {currentView === "archive" && (
              <div className="max-h-64 space-y-2 overflow-auto">
                {archivedGoals.length === 0 ? (
                  <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                    Archived goals will appear here.
                  </p>
                ) : (
                  archivedGoals.map((goal) => {
                    const latest = getLatestEntry(goal.entries)?.value ?? 0;

                    return (
                      <div key={goal.id} className="rounded-md border border-stone-200 p-3">
                        <div className="font-medium">{goal.title}</div>
                        <div className="mt-1 text-xs text-stone-600">
                          Archived: {goal.archivedAt ? formatDateTime(goal.archivedAt) : "unknown"}
                        </div>
                        <div className="mt-1 text-xs text-stone-600">
                          Last progress: {latest} / {goal.target} {goal.unit}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => restoreGoal(goal.id)}
                            disabled={isSaving}
                            className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGoal(goal.id)}
                            disabled={isSaving}
                            className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            Move to trash
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>

            <div
              className={`rounded-lg border border-stone-300 bg-white p-3 shadow-sm ${
                currentView === "trash" ? "" : "hidden"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TrashIcon />
                  Trash
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{deletedGoals.length}</span>
                  <button
                    type="button"
                    aria-expanded={currentView === "trash"}
                    aria-label="Trash"
                    onClick={() => setCurrentView("trash")}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {currentView === "trash" && (
              <div className="max-h-64 space-y-2 overflow-auto">
                {deletedGoals.length === 0 ? (
                  <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                    Deleted goals will appear here.
                  </p>
                ) : (
                  deletedGoals.map((goal) => {
                    const latest = getLatestEntry(goal.entries)?.value ?? 0;

                    return (
                      <div key={goal.id} className="rounded-md border border-stone-200 p-3">
                        <div className="font-medium">{goal.title}</div>
                        <div className="mt-1 text-xs text-stone-600">
                          Deleted: {goal.deletedAt ? formatDateTime(goal.deletedAt) : "unknown"}
                        </div>
                        <div className="mt-1 text-xs text-stone-600">
                          Last progress: {latest} / {goal.target} {goal.unit}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => restoreGoal(goal.id)}
                            disabled={isSaving}
                            className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => permanentlyDeleteGoal(goal.id)}
                            disabled={isSaving}
                            className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            Delete forever
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          </aside>

          <section className={`min-w-0 max-w-full ${currentView === "detail" ? "" : "hidden"}`}>
            {activeGoal ? (
              <div className="grid min-w-0 gap-4">
                <div className="min-w-0 rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
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
                          onKeyDown={(event) => {
                            if (event.key === "Enter") finishEditingGoal();
                          }}
                          className="w-full rounded-md border border-stone-300 px-2 py-1 text-2xl font-semibold outline-none focus:border-emerald-600"
                        />
                      ) : (
                        <h2 className="break-words py-1 text-2xl font-semibold">{activeGoal.title}</h2>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-stone-600">
                        <span>Created: {formatDateTime(activeGoal.createdAt)}</span>
                        <span>Latest: {latestEntry ? formatDateTime(latestEntry.createdAt) : "none"}</span>
                        <span>Deadline: {activeGoal.deadline || "not set"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 self-start">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeGoal) setGoalDraft(toGoalDraft(activeGoal));
                          setIsEditingGoal(false);
                          setIsEntryModalOpen(false);
                          setCurrentView("list");
                        }}
                        className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Back to list
                      </button>
                      {isEditingGoal ? (
                        <>
                          <button
                            type="button"
                            onClick={finishEditingGoal}
                            disabled={isSaving}
                            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingGoal}
                            disabled={isSaving}
                            className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setGoalDraft(toGoalDraft(activeGoal));
                            setIsEditingGoal(true);
                          }}
                          disabled={isSaving}
                          className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => archiveGoal(activeGoal.id)}
                        disabled={isSaving || isEditingGoal}
                        className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGoal(activeGoal.id)}
                        disabled={isSaving || isEditingGoal}
                        className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {isEditingGoal ? (
                    <div className="mt-5 grid gap-4">
                      <label className="grid gap-1 text-sm font-medium">
                        Memo
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
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,180px)]">
                        <label className="grid min-w-0 gap-1 text-sm font-medium">
                          Target
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
                            className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm font-medium">
                          Unit
                          <input
                            value={activeGoalDraft?.unit ?? ""}
                            onChange={(event) =>
                              setGoalDraft((draft) =>
                                draft
                                  ? { ...draft, unit: event.target.value }
                                  : { ...toGoalDraft(activeGoal), unit: event.target.value },
                              )
                            }
                            className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm font-medium">
                          Deadline
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
                            className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4">
                      <div className="rounded-md bg-stone-100 p-3">
                        <div className="text-xs font-medium text-stone-500">Memo</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{activeGoal.memo || "No memo"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-stone-100 px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium text-stone-500">Current</span>{" "}
                          <span className="font-semibold text-stone-900">{latestValue}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">Target</span>{" "}
                          <span className="font-semibold text-stone-900">{activeGoal.target}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">Unit</span>{" "}
                          <span className="font-semibold text-stone-900">{activeGoal.unit}</span>
                        </span>
                        <span>
                          <span className="font-medium text-stone-500">Progress</span>{" "}
                          <span className="font-semibold text-emerald-700">{progressPercent}%</span>
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full bg-emerald-700 transition-all"
                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="grid min-w-0 gap-4">
                    <div className="min-w-0 rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h2 className="text-base font-semibold">Progress chart</h2>
                          <p className="text-sm text-stone-600">Records are plotted by saved date and time.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-emerald-700">
                            Target {activeGoal.target} {activeGoal.unit}
                          </span>
                          <button
                            type="button"
                            aria-label="Add progress record"
                            onClick={() => {
                              setEntryRecordedAt(toDateTimeLocalValue());
                              setIsEntryModalOpen(true);
                            }}
                            disabled={isSaving}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            <AddIcon />
                          </button>
                        </div>
                      </div>
                      <ProgressChart
                        entries={activeGoal.entries}
                        target={activeGoal.target}
                        unit={activeGoal.unit}
                        deadline={activeGoal.deadline}
                      />
                    </div>

                    <div className="min-w-0 rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
                      <h2 className="text-base font-semibold">Record history</h2>
                      <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                        {activeGoal.entries.length === 0 ? (
                          <p className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                            No records yet. Saved records will be written to data/goals.json with their timestamp.
                          </p>
                        ) : (
                          activeGoal.entries
                            .slice()
                            .sort((a, b) => b.createdAt - a.createdAt)
                            .map((entry) =>
                              editingEntryId === entry.id ? (
                                <div key={entry.id} className="grid gap-3 rounded-md border border-emerald-300 p-3">
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
                                      Date and time
                                      <input
                                        type="datetime-local"
                                        value={editEntryRecordedAt}
                                        onChange={(event) => setEditEntryRecordedAt(event.target.value)}
                                        className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                                      />
                                    </label>
                                  </div>
                                  <label className="grid gap-1 text-sm font-medium">
                                    Memo
                                    <textarea
                                      value={editEntryMemo}
                                      onChange={(event) => setEditEntryMemo(event.target.value)}
                                      className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                                    />
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateEntryRecord(entry.id)}
                                      disabled={isSaving}
                                      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingEntryId(null)}
                                      disabled={isSaving}
                                      className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteEntryRecord(entry.id)}
                                      disabled={isSaving}
                                      className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={entry.id}
                                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-stone-200 p-3 text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold">
                                      {entry.value} {activeGoal.unit}
                                    </div>
                                    <div className="text-xs text-stone-500">{formatDateTime(entry.createdAt)}</div>
                                    <p className="mt-2 min-w-0 whitespace-pre-wrap break-words text-sm text-stone-700">
                                      {entry.memo || "No memo"}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => startEditingEntry(entry)}
                                    disabled={isSaving}
                                    className="shrink-0 self-start rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    Edit
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
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
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
                <h2 className="text-base font-semibold">Add progress record</h2>
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
                  Current value
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
                  Record date and time
                  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      type="datetime-local"
                      value={entryRecordedAt}
                      onChange={(event) => setEntryRecordedAt(event.target.value)}
                      className="w-full min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => setEntryRecordedAt(toDateTimeLocalValue())}
                      className="w-full rounded-md border border-stone-300 px-3 py-2 font-normal text-stone-700 hover:bg-stone-100 sm:w-auto"
                    >
                      Now
                    </button>
                  </div>
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  Memo
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
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={addEntry}
                    disabled={isSaving}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {isGoalModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
            <section className="w-full max-w-lg rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Add goal</h2>
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
                  Goal name
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
                  Goal memo
                  <textarea
                    value={goalForm.memo}
                    onChange={(event) => setGoalForm((form) => ({ ...form, memo: event.target.value }))}
                    className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    placeholder="Describe the final goal or why it matters."
                  />
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,96px)]">
                  <label className="grid min-w-0 gap-1 text-sm font-medium">
                    Target
                    <input
                      type="number"
                      min={1}
                      value={goalForm.target}
                      onChange={(event) => setGoalForm((form) => ({ ...form, target: Number(event.target.value) }))}
                      className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-sm font-medium">
                    Unit
                    <input
                      value={goalForm.unit}
                      onChange={(event) => setGoalForm((form) => ({ ...form, unit: event.target.value }))}
                      className="min-w-0 rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-medium">
                  Deadline
                  <input
                    type="date"
                    value={goalForm.deadline}
                    onChange={(event) => setGoalForm((form) => ({ ...form, deadline: event.target.value }))}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGoalModalOpen(false)}
                    disabled={isSaving}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={addGoal}
                    disabled={isSaving}
                    className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {isTodoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
            <section className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Add todo</h2>
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
                  Todo
                  <input
                    value={todoTitle}
                    onChange={(event) => setTodoTitle(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && addTodoItem()}
                    autoFocus
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600"
                    placeholder="Write a task"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTodoModalOpen(false)}
                    disabled={isSaving}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={addTodoItem}
                    disabled={isSaving || !todoTitle.trim()}
                    className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {todoToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
            <section className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Delete todo?</h2>
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
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteTodoItem(todoToDelete.id)}
                  disabled={isSaving}
                  className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
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

function TrashIcon() {
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
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f4] px-5 text-stone-950">
      <section className="w-full max-w-sm rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">MasterPlan</p>
        <h1 className="mt-2 text-2xl font-semibold">{mode === "login" ? "Login" : "Sign up"}</h1>
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

function ReorderControls({
  canMoveUp,
  canMoveDown,
  disabled,
  upLabel,
  downLabel,
  onMoveUp,
  onMoveDown,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  upLabel: string;
  downLabel: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-label={upLabel}
        onClick={(event) => {
          event.stopPropagation();
          onMoveUp();
        }}
        disabled={disabled || !canMoveUp}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowUpIcon />
      </button>
      <button
        type="button"
        aria-label={downLabel}
        onClick={(event) => {
          event.stopPropagation();
          onMoveDown();
        }}
        disabled={disabled || !canMoveDown}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowDownIcon />
      </button>
    </div>
  );
}

function AddIcon() {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
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

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m9 18 6-6-6-6" />
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

