"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

type RoutineMarkStatus = "success" | "failure";

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

const todayIso = new Date().toISOString().slice(0, 10);

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

async function fetchRoutines() {
  const response = await fetch("/api/routines", { cache: "no-store" });
  const data = (await response.json()) as { error?: string; routines?: Routine[]; schemaMissing?: boolean };
  if (!response.ok) throw new Error(data.error || "Failed to load routines");
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
  if (!response.ok || !data.routine) throw new Error(data.error || "Failed to add routine");
  return { routine: data.routine, routines: Array.isArray(data.routines) ? data.routines : [] };
}

async function reorderRoutineList(routineIds: string[]) {
  const response = await fetch("/api/routines", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routineIds }),
  });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to reorder routines");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function patchRoutine(routineId: string, patch: Partial<Pick<Routine, "title" | "memo" | "startDate" | "endDate">>) {
  const response = await fetch(`/api/routines/${routineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to update routine");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function removeRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}`, { method: "DELETE" });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to delete routine");
  return Array.isArray(data.routines) ? data.routines : [];
}

async function archiveExistingRoutine(routineId: string) {
  const response = await fetch(`/api/routines/${routineId}/archive`, { method: "PATCH" });
  const data = (await response.json()) as { error?: string; routines?: Routine[] };
  if (!response.ok) throw new Error(data.error || "Failed to archive routine");
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
  if (!response.ok) throw new Error(data.error || "Failed to update routine mark");
  return Array.isArray(data.routines) ? data.routines : [];
}

function moveToIndex<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export default function RoutineTracker({ isSaving, resetSignal, reloadSignal, onSavingChange, onError }: {
  isSaving: boolean;
  resetSignal: number;
  reloadSignal: number;
  onSavingChange: (isSaving: boolean) => void;
  onError: (error: string) => void;
}) {
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
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routinesBeforeDrag = useRef<Routine[] | null>(null);
  const latestDraggedRoutines = useRef<Routine[] | null>(null);
  const dragImageClone = useRef<HTMLElement | null>(null);

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
        onError(error instanceof Error ? error.message : "Failed to load routines");
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
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      dragImageClone.current?.remove();
    };
  }, []);

  const activeRoutine =
    activeRoutineResetSignal === resetSignal
      ? routines.find((routine) => routine.id === activeRoutineId) ?? null
      : null;

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
      onError(error instanceof Error ? error.message : "Failed to add routine");
    } finally {
      onSavingChange(false);
    }
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
      onError(error instanceof Error ? error.message : "Failed to update routine");
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
      onError(error instanceof Error ? error.message : "Failed to delete routine");
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
      onError(error instanceof Error ? error.message : "Failed to archive routine");
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
      onError(error instanceof Error ? error.message : "Failed to reorder routines");
    } finally {
      onSavingChange(false);
    }
  }

  function makeFloatingDragCard(event: ReactPointerEvent) {
    const card = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-reorder-card]");
    if (!card) return null;

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

  function startRoutineDrag(event: ReactPointerEvent, routineId: string) {
    if (isSaving) {
      event.preventDefault();
      return;
    }

    const dragOffset = makeFloatingDragCard(event);
    if (!dragOffset) return;

    event.preventDefault();
    event.stopPropagation();
    routinesBeforeDrag.current = routines;
    latestDraggedRoutines.current = routines;
    setDraggingRoutineId(routineId);
    setRoutineDropTargetId(routineId);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      moveFloatingDragCard(pointerEvent.clientX, pointerEvent.clientY, dragOffset.offsetX, dragOffset.offsetY);

      const targetCard = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>('[data-reorder-kind="routine"]');
      const targetRoutineId = targetCard?.dataset.reorderId;
      if (!targetRoutineId || targetRoutineId === routineId) return;

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
      routinesBeforeDrag.current = null;
      latestDraggedRoutines.current = null;

      if (previousRoutines && nextRoutines) {
        void saveRoutineOrder(nextRoutines, previousRoutines, routineId);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  async function markDate(routine: Routine, date: string, currentStatus: RoutineMarkStatus | undefined) {
    const nextStatus = currentStatus === undefined ? "success" : currentStatus === "success" ? "failure" : null;
    const previous = routines;
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

    onSavingChange(true);
    onError("");
    try {
      setRoutines(await saveRoutineMark(routine.id, date, nextStatus));
    } catch (error) {
      setRoutines(previous);
      onError(error instanceof Error ? error.message : "Failed to update routine mark");
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <div className="grid gap-4">
      {schemaMissing && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Routine tables are not installed yet. Apply the `supabase/schema.sql` update, then reload this page.
        </section>
      )}

      {activeRoutine ? (
        <section className="rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
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
          />
        </section>
      ) : isLoading ? (
        <section className="rounded-lg border border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
          Loading routines...
        </section>
      ) : (
        <section className="grid gap-4">
          {routines.length === 0 ? (
            <section className="rounded-lg border border-stone-300 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 px-1 pb-2">
                <h2 className="text-base font-semibold">Routine list</h2>
                <button
                  type="button"
                  aria-expanded={isRoutineModalOpen}
                  aria-label="Add routine"
                  onClick={() => setIsRoutineModalOpen(true)}
                  disabled={schemaMissing}
                  className="ml-auto flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  추가+
                </button>
              </div>
              <div className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
                No routines yet. Add a routine with a start and end date to build a chain calendar.
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-stone-300 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 px-1 pb-2">
                <h2 className="text-base font-semibold">Routine list</h2>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">{routines.length}</span>
                  <button
                    type="button"
                    aria-expanded={isRoutineModalOpen}
                    aria-label="Add routine"
                    onClick={() => setIsRoutineModalOpen(true)}
                    disabled={schemaMissing}
                    className="flex h-8 shrink-0 items-center justify-center rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    추가+
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {routines.map((routine) => (
                  <RoutineListItem
                    key={routine.id}
                    routine={routine}
                    isSaving={isSaving}
                    isHighlighted={highlightedRoutineId === routine.id}
                    isDragging={draggingRoutineId === routine.id}
                    isDropTarget={routineDropTargetId === routine.id && draggingRoutineId !== routine.id}
                    onSelect={() => {
                      setActiveRoutineId(routine.id);
                      setActiveRoutineResetSignal(resetSignal);
                      setEditingRoutineId(null);
                    }}
                    onDrag={(event) => startRoutineDrag(event, routine.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {isRoutineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6">
          <section className="w-full max-w-lg rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Add routine</h2>
              <button
                type="button"
                aria-label="Close add routine"
                onClick={() => setIsRoutineModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm font-medium">
                Routine
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && addRoutine()}
                  autoFocus
                  disabled={schemaMissing}
                  className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  placeholder="Example: Morning workout"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Memo
                <textarea
                  value={form.memo}
                  onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                  disabled={schemaMissing}
                  className="min-h-20 resize-y rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  placeholder="Optional note"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  Start
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                    disabled={schemaMissing}
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal outline-none focus:border-emerald-600 disabled:bg-stone-100"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  End
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
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
                  Close
                </button>
                <button
                  type="button"
                  onClick={addRoutine}
                  disabled={isSaving || schemaMissing || !form.title.trim()}
                  className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function RoutineListItem({
  routine,
  isSaving,
  isHighlighted,
  isDragging,
  isDropTarget,
  onSelect,
  onDrag,
}: {
  routine: Routine;
  isSaving: boolean;
  isHighlighted: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onDrag: (event: ReactPointerEvent) => void;
}) {
  const stats = getRoutineStats(routine);

  return (
    <div
      data-reorder-card
      data-reorder-kind="routine"
      data-reorder-id={routine.id}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`w-full cursor-pointer rounded-md border p-3 text-left transition-all duration-500 ${
        isHighlighted
          ? "border-emerald-500 bg-emerald-100 shadow-sm"
          : isDropTarget
            ? "border-emerald-500 bg-white shadow-sm"
            : isDragging
              ? "border-stone-400 bg-white opacity-90 shadow-sm"
              : "border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="break-words font-medium text-stone-950">{routine.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
            <span>{routine.startDate} - {routine.endDate}</span>
            <span>{stats.success} / {stats.total}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span className="pt-1 text-sm font-semibold text-emerald-700">{stats.rate}%</span>
          <ReorderHandle
            disabled={isSaving}
            label={`Drag ${routine.title} to reorder`}
            onPointerDown={onDrag}
          />
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-emerald-700" style={{ width: `${stats.rate}%` }} />
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
}) {
  const stats = getRoutineStats(routine);
  const dates = getVisibleCalendarDates(routine.startDate, routine.endDate);
  const markByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const memoRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = memoRef.current;
    if (!textarea || !editValue) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 96)}px`;
  }, [editValue]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {editValue ? (
            <input
              value={editValue.title}
              onChange={(event) => onEditChange({ ...editValue, title: event.target.value })}
              className="w-full rounded-md border border-stone-300 px-2 py-1 text-lg font-semibold outline-none focus:border-emerald-600"
              aria-label="Edit routine title"
            />
          ) : (
            <h3 className="break-words py-1 text-lg font-semibold">{routine.title}</h3>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
            <span>{routine.startDate} - {routine.endDate}</span>
            <span>{stats.success} success</span>
            <span>{stats.failure} failure</span>
            <span>{stats.missed} missed</span>
          </div>
          {editValue ? (
            <>
              <textarea
                ref={memoRef}
                value={editValue.memo}
                onChange={(event) => onEditChange({ ...editValue, memo: event.target.value })}
                className="mt-2 min-h-24 w-full resize-none overflow-hidden rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 outline-none focus:border-emerald-600"
                aria-label="Edit routine memo"
                placeholder="Memo"
              />
              <div className="mt-3 grid gap-2 rounded-md bg-stone-100 p-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-medium text-stone-500">Start date</span>
                  <input
                    type="date"
                    value={editValue.startDate}
                    onChange={(event) => onEditChange({ ...editValue, startDate: event.target.value })}
                    className="min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600"
                  />
                </label>
                <label className="grid min-w-0 gap-1">
                  <span className="text-xs font-medium text-stone-500">End date</span>
                  <input
                    type="date"
                    value={editValue.endDate}
                    onChange={(event) => onEditChange({ ...editValue, endDate: event.target.value })}
                    className="min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600"
                  />
                </label>
              </div>
            </>
          ) : (
            routine.memo && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-stone-700">{routine.memo}</p>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-wrap justify-end gap-2 md:w-auto">
          <button
            type="button"
            aria-label="Back to list"
            title="Back to list"
            onClick={onBack}
            disabled={isSaving}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
          >
            <BackIcon />
          </button>
          {editValue ? (
            <>
              <button
                type="button"
                aria-label="Save routine"
                title="Save"
                onClick={onSaveEdit}
                disabled={isSaving || !editValue.title.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                <CheckIcon />
              </button>
              <button
                type="button"
                aria-label="Cancel editing routine"
                title="Cancel"
                onClick={onCancelEdit}
                disabled={isSaving}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
              >
                <CloseIcon />
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`Delete ${routine.title}`}
              title="Delete"
              onClick={onDelete}
              disabled={isSaving}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
            >
              <TrashIcon />
            </button>
          )}
          <button
            type="button"
            aria-label={`Archive ${routine.title}`}
            title="Archive"
            onClick={onArchive}
            disabled={isSaving || editValue !== null}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
          >
            <ArchiveIcon />
          </button>
          {editValue ? (
            <button
              type="button"
              aria-label={`Delete ${routine.title}`}
              title="Delete"
              onClick={onDelete}
              disabled
              className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
            >
              <TrashIcon />
            </button>
          ) : (
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
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <ChainCalendar dates={dates} markByDate={markByDate} isSaving={isSaving} onMark={(date) => onMark(routine, date, markByDate.get(date))} />
        <RoutineSuccessGraph routine={routine} />
      </div>
    </div>
  );
}

function ChainCalendar({
  dates,
  markByDate,
  isSaving,
  onMark,
}: {
  dates: string[];
  markByDate: Map<string, RoutineMarkStatus>;
  isSaving: boolean;
  onMark: (date: string) => void;
}) {
  const monthGroups = groupDatesByMonth(dates);

  return (
    <div className="min-w-0">
      {monthGroups.length === 0 ? (
        <div className="rounded-md bg-stone-100 px-3 py-4 text-sm text-stone-600">
          Calendar will appear when this routine reaches the current week.
        </div>
      ) : (
        <div className="space-y-4">
          {monthGroups.map((group) => (
          <section key={group.key} className="rounded-md border border-stone-200 bg-stone-50 p-2">
            <h4 className="mb-2 border-b border-stone-200 pb-2 text-sm font-semibold text-stone-900">
              {group.label}
            </h4>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
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
                    title={`${date}: ${status ?? "unmarked"}`}
                    className={`aspect-square min-h-10 rounded-md border p-1 text-left text-[11px] font-semibold transition ${
                      status === "success"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : status === "failure"
                          ? "border-red-500 bg-red-500 text-white"
                          : isFuture
                            ? "border-stone-200 bg-white text-stone-400"
                            : "border-stone-300 bg-white text-stone-700 hover:border-emerald-500"
                    } disabled:cursor-not-allowed`}
                  >
                    <span>{parseLocalDate(date).getDate()}</span>
                  </button>
                );
              })}
            </div>
            </section>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        <LegendSwatch className="bg-emerald-600" label="Success" />
        <LegendSwatch className="bg-red-500" label="Failure" />
        <LegendSwatch className="border border-stone-300 bg-white" label="Unmarked" />
      </div>
    </div>
  );
}

function RoutineSuccessGraph({ routine }: { routine: Routine }) {
  const stats = getRoutineStats(routine);
  const dates = getDateRange(routine.startDate, routine.endDate).filter((date) => date <= todayIso);
  const markByDate = new Map(routine.marks.map((mark) => [mark.date, mark.status]));
  const scoredDates = dates.filter((date) => markByDate.get(date) === "success" || markByDate.get(date) === "failure");
  const points = scoredDates.map((date, index) => {
    const success = scoredDates.slice(0, index + 1).filter((item) => markByDate.get(item) === "success").length;
    return Math.round((success / (index + 1)) * 100);
  });

  return (
    <div className="min-w-0 rounded-md bg-stone-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-stone-500">Success rate</div>
          <div className="mt-1 text-3xl font-semibold text-emerald-700">{stats.rate}%</div>
        </div>
        <div className="text-right text-xs text-stone-600">
          <div>{stats.success} / {stats.total}</div>
          <div>{scoredDates.length ? `${formatShortDate(scoredDates[0])} - ${formatShortDate(scoredDates.at(-1) ?? scoredDates[0])}` : "No scored days"}</div>
        </div>
      </div>
      <div className="mt-4">
        <MiniLineChart points={points} />
      </div>
    </div>
  );
}

function MiniLineChart({ points }: { points: number[] }) {
  if (!points.length) {
    return <div className="flex h-32 items-center justify-center rounded-md bg-white px-3 text-center text-sm text-stone-500">No routine marks yet. Mark a day to draw the graph.</div>;
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
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="Routine success rate graph">
      <rect x="0" y="0" width={width} height={height} rx="6" fill="#ffffff" />
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line x1={padding} x2={width - padding} y1={yFor(tick)} y2={yFor(tick)} stroke="#e7e5e4" />
          <text x={width - padding} y={yFor(tick) - 3} textAnchor="end" className="fill-stone-400 text-[10px]">
            {tick}%
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#047857" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {points.map((point, index) => (
        <circle key={`${point}-${index}`} cx={xFor(index)} cy={yFor(point)} r="3" fill="#047857" />
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
      <path d="M19 6l-1 14H6L5 6" />
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

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function BackIcon() {
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
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
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
