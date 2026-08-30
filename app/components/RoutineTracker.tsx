"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type RoutineMarkStatus = "success" | "failure";
type AppLanguage = "en" | "ko";
type SortDirection = "asc" | "desc";
type RoutineSortKey = "manual" | "startDate" | "endDate" | "progress";

type RoutineMark = {
  id: string;
  routineId: string;
  date: string;
  status: RoutineMarkStatus;
  createdAt: number;
};

type Routine = {
  id: string;
  title: string;
  memo: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  marks: RoutineMark[];
};

type PendingRoutineMarkSave = {
  routineId: string;
  date: string;
  status: RoutineMarkStatus | null;
  previous: Routine[];
};

type ReorderLongPressState = {
  pointerId: number;
  startX: number;
  startY: number;
  didLongPress: boolean;
  card: HTMLElement;
  captureTarget: HTMLElement;
};

type ScrollLockState = {
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  bodyTouchAction: string;
  documentOverscrollBehavior: string;
};

const todayIso = new Date().toISOString().slice(0, 10);
const LIST_REORDER_LONG_PRESS_MS = 450;
const LIST_REORDER_DRAG_CANCEL_DISTANCE = 10;
const ROUTINE_SORT_KEY_STORAGE_KEY = "boost-mastery.routine-sort-key";
const ROUTINE_SORT_DIRECTION_STORAGE_KEY = "boost-mastery.routine-sort-direction";
const ROUTINE_TEXT = {
  en: {
    routineList: "Habits",
    routine: "Habit",
    add: "ADD+",
    save: "SAVE",
    cancel: "Cancel",
    close: "Close",
    start: "Start",
    end: "End",
    memo: "Memo",
    success: "Success",
    failure: "Failure",
    missed: "missed",
    successLower: "success",
    failureLower: "failure",
    unmarked: "Unmarked",
    noRoutines: "No habits yet. Add a habit with a start and end date to build a chain calendar.",
    noRoutinesShort: "No habits yet.",
    loading: "Loading habits...",
    addRoutine: "Add habit",
    successRate: "Success rate",
    noScoredDays: "No scored days",
    noRoutineMarks: "No habit marks yet. Mark a day to draw the graph.",
    calendarPending: "Calendar will appear when this habit reaches the current week.",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  ko: {
    routineList: "습관",
    routine: "습관",
    summary: "요약",
    add: "추가+",
    save: "저장",
    cancel: "취소",
    close: "닫기",
    start: "시작",
    end: "종료",
    memo: "메모",
    success: "성공",
    failure: "실패",
    missed: "미체크",
    successLower: "성공",
    failureLower: "실패",
    unmarked: "미체크",
    todayChecklist: "오늘의 체크 리스트",
    noRoutines: "아직 습관이 없습니다. 시작일과 종료일이 있는 습관을 추가하세요.",
    noRoutinesShort: "아직 습관이 없습니다.",
    notScheduled: "이 날짜에는 예정되지 않았습니다",
    loading: "습관 불러오는 중...",
    addRoutine: "습관 추가",
    successRate: "성공률",
    noScoredDays: "체크된 날짜 없음",
    noRoutineMarks: "아직 루틴 체크가 없습니다. 날짜를 체크하면 그래프가 표시됩니다.",
    calendarPending: "루틴 기간이 현재 주에 도달하면 캘린더가 표시됩니다.",
    weekdays: ["일", "월", "화", "수", "목", "금", "토"],
  },
} as const;
type RoutineText = (typeof ROUTINE_TEXT)[AppLanguage];

const emptyRoutineForm = {
  title: "",
  memo: "",
  startDate: todayIso,
  endDate: todayIso,
};

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(date: string) {
  const parsed = parseLocalDate(date);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatMonthLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(parseLocalDate(date));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToIsoDate(date: string, days: number) {
  return toIsoDate(addDays(parseLocalDate(date), days));
}

function getCurrentWeekEnd() {
  const today = parseLocalDate(todayIso);
  return toIsoDate(addDays(today, 6 - today.getDay()));
}

function getDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return [];
  const start = parseLocalDate(startDate <= endDate ? startDate : endDate);
  const end = parseLocalDate(startDate <= endDate ? endDate : startDate);
  const dates: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(toIsoDate(cursor));
  }

  return dates;
}

function getVisibleCalendarDates(startDate: string, endDate: string) {
  const currentWeekEnd = getCurrentWeekEnd();
  const visibleEndDate = endDate <= currentWeekEnd ? endDate : currentWeekEnd;
  return getDateRange(startDate, visibleEndDate);
}

function getRecentWeekDates() {
  return Array.from({ length: 7 }, (_, index) => addDaysToIsoDate(todayIso, index - 6));
}

function groupDatesByMonth(dates: string[]) {
  return dates.reduce<Array<{ key: string; label: string; dates: string[] }>>((groups, date) => {
    const key = date.slice(0, 7);
    const latest = groups.at(-1);
    if (latest?.key === key) {
      latest.dates.push(date);
      return groups;
    }

    groups.push({ key, label: formatMonthLabel(date), dates: [date] });
    return groups;
  }, []);
}

function getRoutineStats(routine: Routine) {
  const dates = getDateRange(routine.startDate, routine.endDate).filter((date) => date <= todayIso);
  const statusByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const success = dates.filter((date) => statusByDate.get(date) === "success").length;
  const failure = dates.filter((date) => statusByDate.get(date) === "failure").length;
  const total = success + failure;
  const missed = dates.length - total;
  const rate = total ? Math.round((success / total) * 100) : 0;
  return { total, success, failure, missed, rate };
}

function getSortDirectionMultiplier(direction: SortDirection) {
  return direction === "asc" ? 1 : -1;
}

function compareNullableValues(left: number | string | null, right: number | string | null, direction: SortDirection) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;
  return (left < right ? -1 : 1) * getSortDirectionMultiplier(direction);
}

function getRoutineSortValue(routine: Routine, sortKey: RoutineSortKey) {
  if (sortKey === "startDate") return routine.startDate || null;
  if (sortKey === "endDate") return routine.endDate || null;
  if (sortKey === "progress") return getRoutineStats(routine).rate;
  return null;
}

function sortRoutines(routines: Routine[], sortKey: RoutineSortKey, direction: SortDirection) {
  if (sortKey === "manual") return routines;
  return routines
    .map((routine, index) => ({ routine, index }))
    .sort((left, right) => {
      const compared = compareNullableValues(
        getRoutineSortValue(left.routine, sortKey),
        getRoutineSortValue(right.routine, sortKey),
        direction,
      );
      return compared || left.index - right.index;
    })
    .map(({ routine }) => routine);
}

function isSortDirection(value: string | null): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isRoutineSortKey(value: string | null): value is RoutineSortKey {
  return value === "manual" || value === "startDate" || value === "endDate" || value === "progress";
}

function readStoredRoutineSortKey(): RoutineSortKey {
  try {
    const stored = window.localStorage.getItem(ROUTINE_SORT_KEY_STORAGE_KEY);
    return isRoutineSortKey(stored) ? stored : "manual";
  } catch {
    return "manual";
  }
}

function readStoredRoutineSortDirection(): SortDirection {
  try {
    const stored = window.localStorage.getItem(ROUTINE_SORT_DIRECTION_STORAGE_KEY);
    return isSortDirection(stored) ? stored : "asc";
  } catch {
    return "asc";
  }
}

function writeStoredRoutineSortKey(sortKey: RoutineSortKey) {
  try {
    window.localStorage.setItem(ROUTINE_SORT_KEY_STORAGE_KEY, sortKey);
  } catch {
    // Ignore unavailable storage.
  }
}

function writeStoredRoutineSortDirection(direction: SortDirection) {
  try {
    window.localStorage.setItem(ROUTINE_SORT_DIRECTION_STORAGE_KEY, direction);
  } catch {
    // Ignore unavailable storage.
  }
}

async function fetchRoutines() {
  const response = await fetch("/api/routines", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; routines?: Routine[]; schemaMissing?: boolean };
  if (!response.ok) throw new Error(data.error || "Failed to load habits");
  return {
    routines: Array.isArray(data.routines) ? data.routines : [],
    schemaMissing: data.schemaMissing === true,
    error: data.error,
  };
}

async function createRoutine(input: typeof emptyRoutineForm) {
  const response = await fetch("/api/routines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { error?: string; routine?: Routine; routines?: Routine[] };
  if (!response.ok || !data.routine) throw new Error(data.error || "Failed to add habit");
  return { routine: data.routine, routines: Array.isArray(data.routines) ? data.routines : [] };
}

async function reorderRoutineList(routineIds: string[]) {
  const response = await fetch("/api/routines", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routineIds }),
  });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to reorder habits");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function patchRoutine(routineId: string, patch: Partial<Pick<Routine, "title" | "memo" | "startDate" | "endDate">>) {
  const response = await fetch(`/api/routines/${routineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to update habit");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function removeRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}`, { method: "DELETE" });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to delete habit");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function archiveExistingRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}/archive`, { method: "PATCH" });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to archive habit");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function saveRoutineMark(routineId: string, date: string, status: RoutineMarkStatus | null) {
  const response = status
    ? await fetch(`/api/routines/${routineId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, status }),
      })
    : await fetch(`/api/routines/${routineId}/marks?date=${encodeURIComponent(date)}`, { method: "DELETE" });

  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to update habit mark");
  return Array.isArray(data.routines) ? data.routines : [];
}

function moveToIndex<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function preventListReorderScrollEvent(event: Event) {
  event.preventDefault();
}

export default function RoutineTracker({ language = "en", isSaving, resetSignal, reloadSignal, onSavingChange, onError }: {
  language?: AppLanguage;
  isSaving: boolean;
  resetSignal: number;
  reloadSignal: number;
  onSavingChange: (isSaving: boolean) => void;
  onError: (error: string) => void;
}) {
  const text = ROUTINE_TEXT[language];
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState(emptyRoutineForm);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [activeRoutineResetSignal, setActiveRoutineResetSignal] = useState(resetSignal);
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyRoutineForm);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedRoutineId, setHighlightedRoutineId] = useState<string | null>(null);
  const [draggingRoutineId, setDraggingRoutineId] = useState<string | null>(null);
  const [routineDropTargetId, setRoutineDropTargetId] = useState<string | null>(null);
  const [routineSortKey, setRoutineSortKey] = useState<RoutineSortKey>(() =>
    typeof window === "undefined" ? "manual" : readStoredRoutineSortKey(),
  );
  const [routineSortDirection, setRoutineSortDirection] = useState<SortDirection>(() =>
    typeof window === "undefined" ? "asc" : readStoredRoutineSortDirection(),
  );
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routinesBeforeDrag = useRef<Routine[] | null>(null);
  const latestDraggedRoutines = useRef<Routine[] | null>(null);
  const routineReorderLongPressState = useRef<ReorderLongPressState | null>(null);
  const routineReorderLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRoutineClickAfterDrag = useRef(false);
  const listReorderScrollLock = useRef<ScrollLockState | null>(null);
  const dragImageClone = useRef<HTMLElement | null>(null);
  const pendingMarkSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingMarkSaves = useRef<Record<string, PendingRoutineMarkSave>>({});

  useEffect(() => {
    let isActive = true;

    async function loadRoutines() {
      try {
        const result = await fetchRoutines();
        if (!isActive) return;
        setRoutines(result.routines);
        setSchemaMissing(result.schemaMissing);
        if (result.error) onError(result.error);
      } catch (error) {
        if (!isActive) return;
        onError(error instanceof Error ? error.message : "Failed to load habits");
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadRoutines();
    return () => {
      isActive = false;
    };
  }, [onError, reloadSignal]);

  useEffect(() => {
    const markSaveTimers = pendingMarkSaveTimers.current;
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      if (routineReorderLongPressTimer.current) clearTimeout(routineReorderLongPressTimer.current);
      window.removeEventListener("touchmove", preventListReorderScrollEvent);
      unlockListReorderScroll();
      Object.values(markSaveTimers).forEach((timer) => clearTimeout(timer));
      dragImageClone.current?.remove();
    };
  }, []);

  useEffect(() => {
    writeStoredRoutineSortKey(routineSortKey);
  }, [routineSortKey]);

  useEffect(() => {
    writeStoredRoutineSortDirection(routineSortDirection);
  }, [routineSortDirection]);

  const activeRoutine =
    activeRoutineResetSignal === resetSignal
      ? routines.find((routine) => routine.id === activeRoutineId) ?? null
      : null;
  const visibleRoutines = useMemo(
    () => sortRoutines(routines, routineSortKey, routineSortDirection),
    [routineSortDirection, routineSortKey, routines],
  );

  async function addRoutine() {
    const title = form.title.trim();
    if (!title || schemaMissing) return;

    onSavingChange(true);
    onError("");
    try {
      const result = await createRoutine(form);
      setRoutines(result.routines);
      setActiveRoutineId(result.routine.id);
      setActiveRoutineResetSignal(resetSignal);
      setIsRoutineModalOpen(false);
      setForm({ ...emptyRoutineForm, startDate: todayIso, endDate: todayIso });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to add habit");
    } finally {
      onSavingChange(false);
    }
  }

  function handleRoutineFormKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (isSaving || schemaMissing || !form.title.trim()) return;
    void addRoutine();
  }

  function startEditing(routine: Routine) {
    setEditingRoutineId(routine.id);
    setEditForm({
      title: routine.title,
      memo: routine.memo,
      startDate: routine.startDate,
      endDate: routine.endDate,
    });
  }

  async function saveEdit(routineId: string) {
    const title = editForm.title.trim();
    if (!title) return;

    onSavingChange(true);
    onError("");
    try {
      setRoutines(await patchRoutine(routineId, { ...editForm, title }));
      setEditingRoutineId(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to update habit");
    } finally {
      onSavingChange(false);
    }
  }

  async function deleteRoutine(routineId: string) {
    const previous = routines;
    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    if (activeRoutineId === routineId) {
      setActiveRoutineId(null);
      setEditingRoutineId(null);
    }
    onSavingChange(true);
    onError("");
    try {
      setRoutines(await removeRoutine(routineId));
    } catch (error) {
      setRoutines(previous);
      onError(error instanceof Error ? error.message : "Failed to delete habit");
    } finally {
      onSavingChange(false);
    }
  }

  async function archiveRoutine(routineId: string) {
    const previous = routines;
    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    if (activeRoutineId === routineId) {
      setActiveRoutineId(null);
      setEditingRoutineId(null);
    }
    onSavingChange(true);
    onError("");
    try {
      setRoutines(await archiveExistingRoutine(routineId));
    } catch (error) {
      setRoutines(previous);
      onError(error instanceof Error ? error.message : "Failed to archive habit");
    } finally {
      onSavingChange(false);
    }
  }

  function flashMovedRoutine(routineId: string) {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedRoutineId(routineId);
    highlightTimer.current = setTimeout(() => setHighlightedRoutineId(null), 1100);
  }

  async function saveRoutineOrder(nextRoutines: Routine[], previousRoutines: Routine[], movedRoutineId: string) {
    if (
      nextRoutines.map((routine) => routine.id).join("|") ===
      previousRoutines.map((routine) => routine.id).join("|")
    ) {
      return;
    }

    onSavingChange(true);
    onError("");

    try {
      setRoutines(await reorderRoutineList(nextRoutines.map((routine) => routine.id)));
      flashMovedRoutine(movedRoutineId);
    } catch (error) {
      setRoutines(previousRoutines);
      setHighlightedRoutineId(null);
      onError(error instanceof Error ? error.message : "Failed to reorder habits");
    } finally {
      onSavingChange(false);
    }
  }

  function makeFloatingDragCard(card: HTMLElement, clientX: number, clientY: number) {
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
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
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

  function getRoutineReorderTargetId(clientX: number, clientY: number, draggedId: string) {
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const targetCard = element.closest<HTMLElement>('[data-reorder-kind="routine"]');
      const targetId = targetCard?.dataset.reorderId;
      if (targetId && targetId !== draggedId) return targetId;
    }
    return null;
  }

  function lockListReorderScroll() {
    if (listReorderScrollLock.current) return;
    const body = document.body;
    const documentElement = document.documentElement;
    const scrollY = window.scrollY;
    listReorderScrollLock.current = {
      scrollY,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyTouchAction: body.style.touchAction,
      documentOverscrollBehavior: documentElement.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.touchAction = "none";
    documentElement.style.overscrollBehavior = "none";
    window.addEventListener("touchmove", preventListReorderScrollEvent, { passive: false });
    window.addEventListener("wheel", preventListReorderScrollEvent, { passive: false });
  }

  function unlockListReorderScroll() {
    const lock = listReorderScrollLock.current;
    if (!lock) return;
    const body = document.body;
    const documentElement = document.documentElement;
    body.style.overflow = lock.bodyOverflow;
    body.style.position = lock.bodyPosition;
    body.style.top = lock.bodyTop;
    body.style.width = lock.bodyWidth;
    body.style.touchAction = lock.bodyTouchAction;
    documentElement.style.overscrollBehavior = lock.documentOverscrollBehavior;
    window.removeEventListener("touchmove", preventListReorderScrollEvent);
    window.removeEventListener("wheel", preventListReorderScrollEvent);
    listReorderScrollLock.current = null;
    window.scrollTo(0, lock.scrollY);
  }

  function isListReorderBlockedTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return true;
    return Boolean(target.closest("button, input, textarea, select, label, a"));
  }

  function clearRoutineReorderLongPressTimer() {
    if (!routineReorderLongPressTimer.current) return;
    clearTimeout(routineReorderLongPressTimer.current);
    routineReorderLongPressTimer.current = null;
  }

  function startRoutineReorderLongPress(event: ReactPointerEvent<HTMLElement>, routineId: string) {
    if (isSaving || isListReorderBlockedTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const card = event.currentTarget.closest<HTMLElement>("[data-reorder-card]");
    if (!card) return;

    clearRoutineReorderLongPressTimer();
    routineReorderLongPressState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      didLongPress: false,
      card,
      captureTarget: event.currentTarget,
    };
    routineReorderLongPressTimer.current = setTimeout(() => {
      const pressState = routineReorderLongPressState.current;
      if (!pressState || pressState.pointerId !== event.pointerId) return;
      pressState.didLongPress = true;
      try {
        pressState.captureTarget.setPointerCapture(pressState.pointerId);
      } catch {
        routineReorderLongPressState.current = null;
        return;
      }
      startRoutineDrag(pressState.card, pressState.startX, pressState.startY, routineId);
    }, LIST_REORDER_LONG_PRESS_MS);
  }

  function moveRoutineReorderLongPress(event: ReactPointerEvent<HTMLElement>) {
    const pressState = routineReorderLongPressState.current;
    if (!pressState || pressState.pointerId !== event.pointerId) return;
    if (pressState.didLongPress) {
      event.preventDefault();
      return;
    }

    const distance = Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY);
    if (distance > LIST_REORDER_DRAG_CANCEL_DISTANCE) {
      clearRoutineReorderLongPressTimer();
      routineReorderLongPressState.current = null;
    }
  }

  function endRoutineReorderLongPress(event: ReactPointerEvent<HTMLElement>) {
    const pressState = routineReorderLongPressState.current;
    if (!pressState || pressState.pointerId !== event.pointerId) return;
    clearRoutineReorderLongPressTimer();
    if (pressState.captureTarget.hasPointerCapture(event.pointerId)) {
      pressState.captureTarget.releasePointerCapture(event.pointerId);
    }
    routineReorderLongPressState.current = null;
  }

  function startRoutineDrag(card: HTMLElement, clientX: number, clientY: number, routineId: string) {
    if (isSaving) {
      return;
    }

    const dragOffset = makeFloatingDragCard(card, clientX, clientY);
    if (!dragOffset) return;

    lockListReorderScroll();
    routinesBeforeDrag.current = routines;
    latestDraggedRoutines.current = routines;
    setDraggingRoutineId(routineId);
    setRoutineDropTargetId(routineId);
    suppressRoutineClickAfterDrag.current = true;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      moveFloatingDragCard(pointerEvent.clientX, pointerEvent.clientY, dragOffset.offsetX, dragOffset.offsetY);

      const targetRoutineId = getRoutineReorderTargetId(pointerEvent.clientX, pointerEvent.clientY, routineId);
      if (!targetRoutineId) return;

      setRoutineDropTargetId(targetRoutineId);
      setRoutines((currentRoutines) => {
        const fromIndex = currentRoutines.findIndex((routine) => routine.id === routineId);
        const toIndex = currentRoutines.findIndex((routine) => routine.id === targetRoutineId);
        const nextRoutines = moveToIndex(currentRoutines, fromIndex, toIndex);
        latestDraggedRoutines.current = nextRoutines;
        return nextRoutines;
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      const previousRoutines = routinesBeforeDrag.current;
      const nextRoutines = latestDraggedRoutines.current;

      setDraggingRoutineId(null);
      setRoutineDropTargetId(null);
      removeDragImageClone();
      unlockListReorderScroll();
      routinesBeforeDrag.current = null;
      latestDraggedRoutines.current = null;

      if (previousRoutines && nextRoutines) {
        void saveRoutineOrder(nextRoutines, previousRoutines, routineId);
      }

      window.setTimeout(() => {
        suppressRoutineClickAfterDrag.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function setRoutineMark(routine: Routine, date: string, nextStatus: RoutineMarkStatus | null) {
    const previous = routines;
    const saveKey = `${routine.id}:${date}`;
    setRoutines((current) =>
      current.map((item) =>
        item.id === routine.id
          ? {
              ...item,
              marks:
                nextStatus === null
                  ? item.marks.filter((mark) => mark.date !== date)
                  : [
                      ...item.marks.filter((mark) => mark.date !== date),
                      {
                        id: `pending-${routine.id}-${date}`,
                        routineId: routine.id,
                        date,
                        status: nextStatus,
                        createdAt: Date.now(),
                      },
                    ],
            }
          : item,
      ),
    );

    if (pendingMarkSaveTimers.current[saveKey]) clearTimeout(pendingMarkSaveTimers.current[saveKey]);
    pendingMarkSaves.current[saveKey] = {
      routineId: routine.id,
      date,
      status: nextStatus,
      previous,
    };
    onError("");
    pendingMarkSaveTimers.current[saveKey] = setTimeout(() => {
      void flushRoutineMarkSave(saveKey);
    }, 500);
  }

  function markDate(routine: Routine, date: string, currentStatus: RoutineMarkStatus | undefined) {
    const nextStatus = currentStatus === undefined ? "success" : currentStatus === "success" ? "failure" : null;
    setRoutineMark(routine, date, nextStatus);
  }

  async function flushRoutineMarkSave(saveKey: string) {
    const pendingSave = pendingMarkSaves.current[saveKey];
    if (!pendingSave) return;

    delete pendingMarkSaves.current[saveKey];
    delete pendingMarkSaveTimers.current[saveKey];

    try {
      setRoutines(applyPendingMarkSaves(await saveRoutineMark(pendingSave.routineId, pendingSave.date, pendingSave.status)));
    } catch (error) {
      setRoutines(applyPendingMarkSaves(pendingSave.previous));
      onError(error instanceof Error ? error.message : "Failed to update habit mark");
    }
  }

  function applyPendingMarkSaves(savedRoutines: Routine[]) {
    const pendingSaves = Object.values(pendingMarkSaves.current);
    if (pendingSaves.length === 0) return savedRoutines;

    return savedRoutines.map((routine) => {
      const routinePendingSaves = pendingSaves.filter((save) => save.routineId === routine.id);
      if (routinePendingSaves.length === 0) return routine;

      return routinePendingSaves.reduce<Routine>((nextRoutine, save) => {
        const marks = nextRoutine.marks.filter((mark) => mark.date !== save.date);
        return {
          ...nextRoutine,
          marks:
            save.status === null
              ? marks
              : [
                  ...marks,
                  {
                    id: `pending-${save.routineId}-${save.date}`,
                    routineId: save.routineId,
                    date: save.date,
                    status: save.status,
                    createdAt: Date.now(),
                  },
                ],
        };
      }, routine);
    });
  }

  return (
    <div className="grid gap-0">
      {draggingRoutineId && (
        <div className="fixed left-1/2 top-3 z-[80] -translate-x-1/2 rounded-full border border-emerald-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-lg backdrop-blur">
          {language === "ko" ? "습관 순서 변경 중" : "Reordering habits"}
        </div>
      )}

      {schemaMissing && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Habit data tables are not installed yet. Apply the `supabase/schema.sql` update, then reload this page.
        </section>
      )}

      {activeRoutine ? (
        <section className="border border-transparent bg-transparent p-0">
          <RoutineCard
            routine={activeRoutine}
            isSaving={isSaving}
            editValue={editingRoutineId === activeRoutine.id ? editForm : null}
            onEditChange={setEditForm}
            onBack={() => {
              setActiveRoutineId(null);
              setEditingRoutineId(null);
            }}
            onEdit={() => startEditing(activeRoutine)}
            onCancelEdit={() => setEditingRoutineId(null)}
            onSaveEdit={() => saveEdit(activeRoutine.id)}
            onArchive={() => archiveRoutine(activeRoutine.id)}
            onDelete={() => deleteRoutine(activeRoutine.id)}
            onMark={markDate}
            text={text}
          />
        </section>
      ) : isLoading ? (
        <section className="border border-transparent bg-transparent p-0 text-center text-sm text-stone-600">
          {text.loading}
        </section>
      ) : (
        <section className="grid gap-0">
          {routines.length === 0 ? (
            <section className="border border-transparent bg-transparent p-0">
              <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <HabitIcon />
                  {text.routineList}
                </h2>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <select
                    value={routineSortKey}
                    onChange={(event) => setRoutineSortKey(event.target.value as RoutineSortKey)}
                    aria-label={language === "ko" ? "습관 정렬 기준" : "Habit sort"}
                    className="h-8 rounded-md border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-700 outline-none focus:border-emerald-600"
                  >
                    <option value="manual">{language === "ko" ? "커스텀정렬" : "Custom sort"}</option>
                    <option value="startDate">{text.start}</option>
                    <option value="endDate">{language === "ko" ? "완료일" : "End date"}</option>
                    <option value="progress">{language === "ko" ? "달성도" : text.successRate}</option>
                  </select>
                  <button
                    type="button"
                    aria-label={language === "ko" ? "습관 오름차순 정렬" : "Sort habits ascending"}
                    aria-pressed={routineSortDirection === "asc"}
                    onClick={() => setRoutineSortDirection("asc")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${
                      routineSortDirection === "asc"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={language === "ko" ? "습관 내림차순 정렬" : "Sort habits descending"}
                    aria-pressed={routineSortDirection === "desc"}
                    onClick={() => setRoutineSortDirection("desc")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${
                      routineSortDirection === "desc"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  aria-expanded={isRoutineModalOpen}
                  aria-label="Add habit"
                  onClick={() => setIsRoutineModalOpen(true)}
                  disabled={schemaMissing}
                  className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {text.add}
                </button>
              </div>
              <div className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                {text.noRoutines}
              </div>
            </section>
          ) : (
            <section className="border border-transparent bg-transparent p-0">
              <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <HabitIcon />
                  {text.routineList}
                </h2>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <select
                    value={routineSortKey}
                    onChange={(event) => setRoutineSortKey(event.target.value as RoutineSortKey)}
                    aria-label={language === "ko" ? "습관 정렬 기준" : "Habit sort"}
                    className="h-8 rounded-md border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-700 outline-none focus:border-emerald-600"
                  >
                    <option value="manual">{language === "ko" ? "커스텀정렬" : "Custom sort"}</option>
                    <option value="startDate">{text.start}</option>
                    <option value="endDate">{language === "ko" ? "완료일" : "End date"}</option>
                    <option value="progress">{language === "ko" ? "달성도" : text.successRate}</option>
                  </select>
                  <button
                    type="button"
                    aria-label={language === "ko" ? "습관 오름차순 정렬" : "Sort habits ascending"}
                    aria-pressed={routineSortDirection === "asc"}
                    onClick={() => setRoutineSortDirection("asc")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${
                      routineSortDirection === "asc"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={language === "ko" ? "습관 내림차순 정렬" : "Sort habits descending"}
                    aria-pressed={routineSortDirection === "desc"}
                    onClick={() => setRoutineSortDirection("desc")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${
                      routineSortDirection === "desc"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    ↓
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={isRoutineModalOpen}
                    aria-label="Add habit"
                    onClick={() => setIsRoutineModalOpen(true)}
                    disabled={schemaMissing}
                    className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {text.add}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {visibleRoutines.map((routine) => (
                  <RoutineListItem
                    key={routine.id}
                    routine={routine}
                    language={language}
                    isSaving={isSaving}
                    isHighlighted={highlightedRoutineId === routine.id}
                    isDragging={draggingRoutineId === routine.id}
                    isDropTarget={routineDropTargetId === routine.id && draggingRoutineId !== routine.id}
                    onSelect={() => {
                      if (suppressRoutineClickAfterDrag.current) return;
                      setActiveRoutineId(routine.id);
                      setActiveRoutineResetSignal(resetSignal);
                      setEditingRoutineId(null);
                    }}
                    onPointerDown={(event) => {
                      if (routineSortKey === "manual") startRoutineReorderLongPress(event, routine.id);
                    }}
                    onPointerMove={moveRoutineReorderLongPress}
                    onPointerUp={endRoutineReorderLongPress}
                    onPointerCancel={endRoutineReorderLongPress}
                    onMark={markDate}
                  />
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {typeof document !== "undefined" && isRoutineModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-stone-950/40">
          <section className="fixed left-1/2 top-1/2 w-[calc(100dvw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{text.addRoutine}</h2>
              <button
                type="button"
                aria-label="Close add habit"
                onClick={() => setIsRoutineModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                {text.routine}
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  onKeyDown={handleRoutineFormKeyDown}
                  autoFocus
                  disabled={schemaMissing}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  placeholder="Example: Morning workout"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {text.memo}
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                  onKeyDown={handleRoutineFormKeyDown}
                  disabled={schemaMissing}
                  className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  placeholder="Optional note"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  {text.start}
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                    onKeyDown={handleRoutineFormKeyDown}
                    disabled={schemaMissing}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  {text.end}
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                    onKeyDown={handleRoutineFormKeyDown}
                    disabled={schemaMissing}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoutineModalOpen(false)}
                  disabled={isSaving}
                  className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {text.close}
                </button>
                <button
                  type="button"
                  onClick={addRoutine}
                  disabled={isSaving || schemaMissing || !form.title.trim()}
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
    </div>
  );
}

function RoutineListItem({
  routine,
  language,
  isSaving,
  isHighlighted,
  isDragging,
  isDropTarget,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onMark,
}: {
  routine: Routine;
  language: AppLanguage;
  isSaving: boolean;
  isHighlighted: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onMark: (routine: Routine, date: string, status: RoutineMarkStatus | undefined) => void;
}) {
  const recentWeekDates = getRecentWeekDates();
  const markByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));

  return (
    <div
      data-reorder-card
      data-reorder-kind="routine"
      data-reorder-id={routine.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`relative w-full cursor-pointer overflow-hidden rounded-md border p-3 text-left transition-all duration-500 ${
        isHighlighted
          ? "border-emerald-500 bg-emerald-100 shadow-sm"
          : isDropTarget
            ? "border-emerald-500 bg-white shadow-sm"
            : isDragging
              ? "pointer-events-none border-stone-400 bg-white opacity-0 shadow-sm"
              : "border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50"
      } ${isDragging ? "pt-9" : ""}`}
    >
      {isDragging && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
          {language === "ko" ? "이동 중" : "Moving"}
        </div>
      )}
      <div className="relative flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-medium text-stone-950">{routine.title}</div>
        </div>
        <div className="grid shrink-0 grid-cols-7 justify-items-start gap-0.5">
          {recentWeekDates.map((date) => {
            const status = date >= routine.startDate && date <= routine.endDate ? markByDate.get(date) : undefined;
            const isOutOfRange = date < routine.startDate || date > routine.endDate;
            return (
              <button
                type="button"
                key={`${routine.id}-${date}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMark(routine, date, status);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                disabled={isSaving || isOutOfRange}
                aria-label={`Mark ${routine.title} on ${date}`}
                title={`${date}: ${status ? (status === "success" ? "Success" : "Failure") : "Unmarked"}`}
                className={`relative flex h-7 w-7 items-start overflow-hidden rounded-md border p-0.5 text-[10px] font-semibold transition ${
                status === "success"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : status === "failure"
                    ? "border-red-500 bg-red-500 text-white"
                    : isOutOfRange
                      ? "border-stone-200 bg-stone-50 text-stone-400"
                      : "border-stone-300 bg-white text-stone-700 hover:border-emerald-500"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              >
              {(status === "success" || status === "failure") && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-black leading-none text-white/35">
                  {status === "success" ? <ThumbsUpMark /> : "X"}
                </span>
              )}
              <span className="relative z-10">{parseLocalDate(date).getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoutineCard({
  routine,
  isSaving,
  editValue,
  onEditChange,
  onBack,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onArchive,
  onDelete,
  onMark,
  text,
}: {
  routine: Routine;
  isSaving: boolean;
  editValue: typeof emptyRoutineForm | null;
  onEditChange: (value: typeof emptyRoutineForm) => void;
  onBack: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMark: (routine: Routine, date: string, status: RoutineMarkStatus | undefined) => void;
  text: RoutineText;
}) {
  const stats = getRoutineStats(routine);
  const dates = getVisibleCalendarDates(routine.startDate, routine.endDate);
  const markByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const handleEditKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (isSaving || !editValue?.title.trim()) return;
    onSaveEdit();
  };

  return (
    <div className="grid gap-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {editValue ? (
            <input
              value={editValue.title}
              onChange={(event) => onEditChange({ ...editValue, title: event.target.value })}
              onKeyDown={handleEditKeyDown}
              className="w-full rounded-md border border-stone-300 px-2 py-1 text-lg font-semibold outline-none focus:border-emerald-600"
              aria-label="Edit routine title"
            />
          ) : (
            <h3 className="break-words py-1 text-lg font-semibold">{routine.title}</h3>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
            {editValue ? (
              <>
                <span className="inline-flex items-center gap-1">
                  {text.start}:{" "}
                  <input
                    type="date"
                    value={editValue.startDate}
                    onChange={(event) => onEditChange({ ...editValue, startDate: event.target.value })}
                    onKeyDown={handleEditKeyDown}
                    className="h-6 w-[8.5rem] rounded border border-stone-300 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-emerald-600"
                    aria-label="Edit routine start date"
                  />
                </span>
                <span className="inline-flex items-center gap-1">
                  {text.end}:{" "}
                  <input
                    type="date"
                    value={editValue.endDate}
                    onChange={(event) => onEditChange({ ...editValue, endDate: event.target.value })}
                    onKeyDown={handleEditKeyDown}
                    className="h-6 w-[8.5rem] rounded border border-stone-300 bg-white px-1.5 text-xs text-stone-700 outline-none focus:border-emerald-600"
                    aria-label="Edit routine end date"
                  />
                </span>
              </>
            ) : (
              <span>{routine.startDate} - {routine.endDate}</span>
            )}
            <span>{stats.success} {text.successLower}</span>
            <span>{stats.failure} {text.failureLower}</span>
            <span>{stats.missed} {text.missed}</span>
          </div>
          {editValue ? (
            <>
              <textarea
                value={editValue.memo}
                onChange={(event) => onEditChange({ ...editValue, memo: event.target.value })}
                onKeyDown={handleEditKeyDown}
                className="mt-2 min-h-24 w-full resize-y overflow-auto rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 outline-none focus:border-emerald-600"
                aria-label="Edit routine memo"
                placeholder={text.memo}
              />
            </>
          ) : (
            routine.memo && (
              <p className="mt-2 whitespace-pre-wrap break-words rounded-md border border-stone-200 bg-white p-3 text-sm text-stone-700">
                {routine.memo}
              </p>
            )
          )}
        </div>
        <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 md:w-auto">
          {editValue ? (
            <>
              <button
                type="button"
                aria-label="Save routine"
                title={text.save}
                onClick={onSaveEdit}
                disabled={isSaving || !editValue.title.trim()}
                className="flex h-8 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                {text.save}
              </button>
              <button
                type="button"
                aria-label="Cancel editing routine"
                title={text.cancel}
                onClick={onCancelEdit}
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
                aria-label="Back to routine list"
                title="Back to routine list"
                onClick={onBack}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                <BackToListIcon />
              </button>
              <button
                type="button"
                aria-label={`Delete ${routine.title}`}
                title="Delete"
                onClick={onDelete}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              >
                <BinIcon />
              </button>
              <button
                type="button"
                aria-label={`Archive ${routine.title}`}
                title="Archive"
                onClick={onArchive}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                <ArchiveIcon />
              </button>
              <button
                type="button"
                aria-label={`Edit ${routine.title}`}
                title="Edit"
                onClick={onEdit}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
              >
                <EditIcon />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <ChainCalendar dates={dates} markByDate={markByDate} isSaving={isSaving} onMark={(date) => onMark(routine, date, markByDate.get(date))} text={text} />
        <RoutineSuccessGraph routine={routine} text={text} />
      </div>
    </div>
  );
}

function ChainCalendar({
  dates,
  markByDate,
  isSaving,
  onMark,
  text,
}: {
  dates: string[];
  markByDate: Map<string, RoutineMarkStatus>;
  isSaving: boolean;
  onMark: (date: string) => void;
  text: RoutineText;
}) {
  const monthGroups = groupDatesByMonth(dates);

  return (
    <div className="min-w-0">
      {monthGroups.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-white px-3 py-4 text-sm text-stone-600">
          {text.calendarPending}
        </div>
      ) : (
        <div className="space-y-4">
          {monthGroups.map((group) => (
          <section key={group.key} className="rounded-md border border-stone-200 bg-white p-2">
            <h4 className="mb-2 border-b border-stone-200 pb-2 text-sm font-semibold text-stone-900">
              {group.label}
            </h4>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-500">
              {text.weekdays.map((day) => (
                <div key={`${group.key}-${day}`}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: parseLocalDate(group.dates[0]).getDay() }).map((_, index) => (
                <div key={`${group.key}-blank-${index}`} aria-hidden="true" />
              ))}
              {group.dates.map((date) => {
                const status = markByDate.get(date);
                const isFuture = date > todayIso;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onMark(date)}
                    disabled={isSaving || isFuture}
                    title={`${date}: ${status ? (status === "success" ? text.success : text.failure) : text.unmarked}`}
                    className={`relative aspect-square min-h-10 overflow-hidden rounded-md border p-1 text-left text-[11px] font-semibold transition ${
                      status === "success"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : status === "failure"
                          ? "border-red-500 bg-red-500 text-white"
                          : isFuture
                            ? "border-stone-200 bg-white text-stone-400"
                            : "border-stone-300 bg-white text-stone-700 hover:border-emerald-500"
                    } disabled:cursor-not-allowed`}
                  >
                    {(status === "success" || status === "failure") && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(2rem,9vw,4.5rem)] font-black leading-none text-white/35">
                        {status === "success" ? <ThumbsUpMark /> : "X"}
                      </span>
                    )}
                    <span className="relative z-10">{parseLocalDate(date).getDate()}</span>
                  </button>
                );
              })}
            </div>
            </section>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        <LegendSwatch className="bg-emerald-600" label={text.success} />
        <LegendSwatch className="bg-red-500" label={text.failure} />
        <LegendSwatch className="border border-stone-300 bg-white" label={text.unmarked} />
      </div>
    </div>
  );
}

function RoutineSuccessGraph({ routine, text }: { routine: Routine; text: RoutineText }) {
  const stats = getRoutineStats(routine);
  const dates = getDateRange(routine.startDate, routine.endDate).filter((date) => date <= todayIso);
  const markByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const scoredDates = dates.filter((date) => markByDate.get(date) === "success" || markByDate.get(date) === "failure");
  const points = scoredDates.map((date, index) => {
    const success = scoredDates.slice(0, index + 1).filter((item) => markByDate.get(item) === "success").length;
    return Math.round((success / (index + 1)) * 100);
  });

  return (
    <div className="min-w-0 rounded-md border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-stone-500">{text.successRate}</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-700">{stats.rate}%</div>
        </div>
        <div className="text-right text-xs text-stone-600">
          <div>{stats.success} / {stats.total}</div>
          <div>{scoredDates.length ? `${formatShortDate(scoredDates[0])} - ${formatShortDate(scoredDates.at(-1) ?? scoredDates[0])}` : text.noScoredDays}</div>
        </div>
      </div>
      <div className="mt-4">
        <MiniLineChart points={points} text={text} />
      </div>
    </div>
  );
}

function MiniLineChart({ points, text }: { points: number[]; text: RoutineText }) {
  if (!points.length) {
    return <div className="flex h-32 items-center justify-center rounded-md bg-white px-3 text-center text-sm text-stone-500">{text.noRoutineMarks}</div>;
  }

  const width = 300;
  const height = 132;
  const padding = 14;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const xFor = (index: number) => padding + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => padding + plotHeight - (value / 100) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="routine-chart block h-auto w-full" role="img" aria-label="Routine success rate graph">
      <rect className="routine-chart-bg" x="0" y="0" width={width} height={height} rx="6" fill="var(--chart-plot-bg)" />
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line className="routine-chart-grid-line" x1={padding} x2={width - padding} y1={yFor(tick)} y2={yFor(tick)} stroke="var(--chart-grid-line)" />
          <text x={width - padding} y={yFor(tick) - 3} textAnchor="end" className="routine-chart-text fill-stone-400 text-[10px]">
            {tick}%
          </text>
        </g>
      ))}
      <path className="routine-chart-line" d={path} fill="none" stroke="var(--chart-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {points.map((point, index) => (
        <circle className="routine-chart-dot" key={`${point}-${index}`} cx={xFor(index)} cy={yFor(point)} r="3" fill="var(--chart-primary)" />
      ))}
    </svg>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function ThumbsUpMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="h-[88%] w-[88%]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M25 53H14c-3 0-5-2-5-5V30c0-3 2-5 5-5h11v28Z"
        fill="currentColor"
        fillOpacity="0.22"
        strokeWidth="4"
      />
      <path
        d="M25 27c6-5 9-11 10-18 0-3 3-5 6-3 3 2 4 6 3 10l-2 8h9c4 0 7 3 6 7l-4 17c-1 4-4 6-8 6H25V27Z"
        fill="currentColor"
        fillOpacity="0.3"
        strokeWidth="4"
      />
      <path d="M16 33v13" strokeWidth="4" />
      <path d="M43 25h8" strokeWidth="4" />
      <path d="M42 35h10" strokeWidth="4" />
      <path d="M40 45h9" strokeWidth="4" />
    </svg>
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
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function HabitIcon() {
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
      <path d="M4 7h16" />
      <path d="M6 7v13h12V7" />
      <path d="M9 11h6" />
      <path d="M8 4h8l2 3H6l2-3z" />
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

