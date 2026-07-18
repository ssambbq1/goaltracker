import { ensureAppUser, requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type RoutineMarkStatus = "success" | "failure";

export type RoutineMark = {
  id: string;
  routineId: string;
  date: string;
  status: RoutineMarkStatus;
  createdAt: number;
};

export type Routine = {
  id: string;
  title: string;
  memo: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  deletedAt?: number;
  archivedAt?: number;
  marks: RoutineMark[];
};

export type NewRoutineInput = {
  title: string;
  memo: string;
  startDate: string;
  endDate: string;
};

export type RoutinePatchInput = Partial<Pick<Routine, "title" | "memo" | "startDate" | "endDate">>;

const ROUTINE_GOAL_UNIT = "__routine__";
const ROUTINE_GOAL_MEMO_PREFIX = "__boostmaster_routine__:";
const ROUTINE_MARK_MEMO_PREFIX = "__boostmaster_routine_mark__:";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function orderDates(startDate: string, endDate: string) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start && !end) {
    const today = new Date().toISOString().slice(0, 10);
    return { startDate: today, endDate: today };
  }
  if (!start) return { startDate: end, endDate: end };
  if (!end) return { startDate: start, endDate: start };
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

function isMissingRoutinesTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const message = String(record.message ?? "");
  return record.code === "PGRST205" && (message.includes("public.routines") || message.includes("public.routine_marks"));
}

export function isRoutineSchemaMissingError(error: unknown) {
  return isMissingRoutinesTableError(error);
}

function encodeRoutineMemo(memo: string, startDate: string) {
  return `${ROUTINE_GOAL_MEMO_PREFIX}${JSON.stringify({ memo, startDate })}`;
}

function decodeRoutineMemo(value: string) {
  if (!value.startsWith(ROUTINE_GOAL_MEMO_PREFIX)) return { memo: value, startDate: "" };

  try {
    const parsed = JSON.parse(value.slice(ROUTINE_GOAL_MEMO_PREFIX.length)) as {
      memo?: unknown;
      startDate?: unknown;
    };
    return {
      memo: typeof parsed.memo === "string" ? parsed.memo : "",
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
    };
  } catch {
    return { memo: "", startDate: "" };
  }
}

function encodeRoutineMarkMemo(date: string, status: RoutineMarkStatus) {
  return `${ROUTINE_MARK_MEMO_PREFIX}${JSON.stringify({ date, status })}`;
}

function decodeRoutineMarkMemo(
  value: string,
  createdAt: number,
  entryValue: number,
): { date: string; status: RoutineMarkStatus } {
  if (value.startsWith(ROUTINE_MARK_MEMO_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(ROUTINE_MARK_MEMO_PREFIX.length)) as {
        date?: unknown;
        status?: unknown;
      };
      return {
        date: typeof parsed.date === "string" ? parsed.date : toDateFromTimestamp(createdAt),
        status: parsed.status === "failure" ? "failure" : "success",
      };
    } catch {
      return { date: toDateFromTimestamp(createdAt), status: entryValue >= 1 ? "success" : "failure" };
    }
  }

  return { date: toDateFromTimestamp(createdAt), status: entryValue >= 1 ? "success" : "failure" };
}

function toTimestampFromDate(date: string) {
  return new Date(`${date}T12:00:00`).getTime();
}

function toDateFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readRoutinesFromGoalRows(loginId: string) {
  const supabase = getSupabaseServerClient();
  const { data: routineRows, error: routinesError } = await supabase
    .from("goals")
    .select("id,title,memo,deadline,created_at_ms,deleted_at_ms,archived_at_ms")
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT)
    .is("deleted_at_ms", null)
    .is("archived_at_ms", null)
    .order("position", { ascending: true })
    .order("created_at_ms", { ascending: false });

  if (routinesError) throw routinesError;
  if (!routineRows?.length) return [];

  const routineIds = routineRows.map((routine) => routine.id);
  const { data: entryRows, error: entriesError } = await supabase
    .from("progress_entries")
    .select("id,goal_id,created_at_ms,value,memo")
    .in("goal_id", routineIds)
    .order("created_at_ms", { ascending: true });

  if (entriesError) throw entriesError;

  const marksByRoutine = new Map<string, RoutineMark[]>();
  for (const entry of entryRows ?? []) {
    const decoded = decodeRoutineMarkMemo(entry.memo, entry.created_at_ms, entry.value);
    const marks = marksByRoutine.get(entry.goal_id) ?? [];
    marks.push({
      id: entry.id,
      routineId: entry.goal_id,
      date: decoded.date,
      status: decoded.status,
      createdAt: entry.created_at_ms,
    });
    marksByRoutine.set(entry.goal_id, marks);
  }

  return routineRows.map((routine) => {
    const decoded = decodeRoutineMemo(routine.memo);
    return {
      id: routine.id,
      title: routine.title,
      memo: decoded.memo,
      startDate: decoded.startDate || routine.deadline,
      endDate: routine.deadline,
      createdAt: routine.created_at_ms,
      deletedAt: routine.deleted_at_ms ?? undefined,
      archivedAt: routine.archived_at_ms ?? undefined,
      marks: marksByRoutine.get(routine.id) ?? [],
    };
  });
}

async function readStoredRoutineGoalRows(loginId: string, kind: "archived" | "deleted") {
  const supabase = getSupabaseServerClient();
  const query = supabase
    .from("goals")
    .select("id,title,memo,deadline,created_at_ms,deleted_at_ms,archived_at_ms")
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT);

  const { data: routineRows, error: routinesError } =
    kind === "archived"
      ? await query.is("deleted_at_ms", null).not("archived_at_ms", "is", null).order("archived_at_ms", { ascending: false })
      : await query.not("deleted_at_ms", "is", null).order("deleted_at_ms", { ascending: false });

  if (routinesError) throw routinesError;
  if (!routineRows?.length) return [];

  return routineRows.map((routine) => {
    const decoded = decodeRoutineMemo(routine.memo);
    return {
      id: routine.id,
      title: routine.title,
      memo: decoded.memo,
      startDate: decoded.startDate || routine.deadline,
      endDate: routine.deadline,
      createdAt: routine.created_at_ms,
      deletedAt: routine.deleted_at_ms ?? undefined,
      archivedAt: routine.archived_at_ms ?? undefined,
      marks: [],
    };
  });
}

async function addRoutineToGoalRows(loginId: string, routine: Routine) {
  const { error } = await getSupabaseServerClient().from("goals").insert({
    id: routine.id,
    user_id: loginId,
    title: routine.title,
    memo: encodeRoutineMemo(routine.memo, routine.startDate),
    target: 1,
    unit: ROUTINE_GOAL_UNIT,
    deadline: routine.endDate,
    created_at_ms: routine.createdAt,
    deleted_at_ms: routine.deletedAt ?? null,
    archived_at_ms: routine.archivedAt ?? null,
    position: -1,
  });

  if (error) throw error;
}

async function updateRoutineInGoalRows(loginId: string, routineId: string, patch: RoutinePatchInput, current: Routine) {
  const ordered = orderDates(patch.startDate ?? current.startDate, patch.endDate ?? current.endDate);
  const title = patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title;
  const memo = patch.memo !== undefined ? patch.memo.trim() : current.memo;
  const { error } = await getSupabaseServerClient()
    .from("goals")
    .update({
      title,
      memo: encodeRoutineMemo(memo, ordered.startDate),
      deadline: ordered.endDate,
    })
    .eq("id", routineId)
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT);

  if (error) throw error;
}

async function deleteRoutineFromGoalRows(loginId: string, routineId: string) {
  const { error } = await getSupabaseServerClient()
    .from("goals")
    .delete()
    .eq("id", routineId)
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT);

  if (error) throw error;
}

async function deleteFallbackMarksForDate(routineId: string, date: string) {
  const supabase = getSupabaseServerClient();
  const { data: entries, error: readError } = await supabase
    .from("progress_entries")
    .select("id,created_at_ms,value,memo")
    .eq("goal_id", routineId);

  if (readError) throw readError;

  const entryIds = (entries ?? [])
    .filter((entry) => decodeRoutineMarkMemo(entry.memo, entry.created_at_ms, entry.value).date === date)
    .map((entry) => entry.id);

  if (!entryIds.length) return;

  const { error } = await supabase.from("progress_entries").delete().in("id", entryIds).eq("goal_id", routineId);
  if (error) throw error;
}

async function setRoutineMarkInGoalRows(routineId: string, date: string, status: RoutineMarkStatus) {
  await deleteFallbackMarksForDate(routineId, date);
  const { error } = await getSupabaseServerClient().from("progress_entries").insert({
    id: makeId("routine-mark"),
    goal_id: routineId,
    created_at_ms: toTimestampFromDate(date),
    value: status === "success" ? 1 : 0,
    memo: encodeRoutineMarkMemo(date, status),
  });

  if (error) throw error;
}

async function readStoredRoutines() {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data: routineRows, error: routinesError } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", loginId)
    .order("position", { ascending: true })
    .order("created_at_ms", { ascending: false });

  if (routinesError) {
    if (isMissingRoutinesTableError(routinesError)) return readRoutinesFromGoalRows(loginId);
    throw routinesError;
  }
  if (!routineRows?.length) return [];

  const routineIds = routineRows.map((routine) => routine.id);
  const { data: markRows, error: marksError } = await supabase
    .from("routine_marks")
    .select("*")
    .in("routine_id", routineIds)
    .order("date", { ascending: true });

  if (marksError) throw marksError;

  const marksByRoutine = new Map<string, RoutineMark[]>();
  for (const mark of markRows ?? []) {
    const marks = marksByRoutine.get(mark.routine_id) ?? [];
    marks.push({
      id: mark.id,
      routineId: mark.routine_id,
      date: mark.date,
      status: mark.status,
      createdAt: mark.created_at_ms,
    });
    marksByRoutine.set(mark.routine_id, marks);
  }

  return routineRows.map((routine) => ({
    id: routine.id,
    title: routine.title,
    memo: routine.memo,
    startDate: routine.start_date,
    endDate: routine.end_date,
    createdAt: routine.created_at_ms,
    marks: marksByRoutine.get(routine.id) ?? [],
  }));
}

export async function readRoutines() {
  return readStoredRoutines();
}

export async function readArchivedRoutines() {
  return readStoredRoutineGoalRows(await requireLoginId(), "archived");
}

export async function readDeletedRoutines() {
  return readStoredRoutineGoalRows(await requireLoginId(), "deleted");
}

export async function reorderRoutines(routineIds: string[]) {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const active = await readRoutines();
  const knownActiveIds = new Set(active.map((routine) => routine.id));
  const orderedIds = [
    ...routineIds.filter((routineId) => knownActiveIds.has(routineId)),
    ...active.map((routine) => routine.id).filter((routineId) => !routineIds.includes(routineId)),
  ];

  const results = await Promise.all(
    orderedIds.map((routineId, index) =>
      supabase.from("routines").update({ position: index }).eq("id", routineId).eq("user_id", loginId),
    ),
  );
  const missingRoutineTableError = results.find((result) => result.error && isMissingRoutinesTableError(result.error));

  if (missingRoutineTableError) {
    await Promise.all(
      orderedIds.map((routineId, index) =>
        supabase
          .from("goals")
          .update({ position: index })
          .eq("id", routineId)
          .eq("user_id", loginId)
          .eq("unit", ROUTINE_GOAL_UNIT)
          .throwOnError(),
      ),
    );
    return readRoutinesFromGoalRows(loginId);
  }

  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;

  return readRoutines();
}

export async function addRoutine(input: NewRoutineInput) {
  const loginId = await requireLoginId();
  await ensureAppUser(loginId);
  const active = await readRoutines();
  const { startDate, endDate } = orderDates(input.startDate, input.endDate);
  const routine: Routine = {
    id: makeId("routine"),
    title: input.title.trim(),
    memo: input.memo.trim(),
    startDate,
    endDate,
    createdAt: Date.now(),
    marks: [],
  };

  const { error } = await getSupabaseServerClient().from("routines").insert({
    id: routine.id,
    user_id: loginId,
    title: routine.title,
    memo: routine.memo,
    start_date: routine.startDate,
    end_date: routine.endDate,
    created_at_ms: routine.createdAt,
    position: active.length ? -1 : 0,
  });

  if (error) {
    if (isMissingRoutinesTableError(error)) {
      await addRoutineToGoalRows(loginId, routine);
      return { routine, routines: await readRoutinesFromGoalRows(loginId) };
    }
    throw error;
  }
  return { routine, routines: await readRoutines() };
}

export async function updateRoutine(routineId: string, patch: RoutinePatchInput) {
  const loginId = await requireLoginId();
  const current = (await readRoutines()).find((routine) => routine.id === routineId);
  if (!current) return readRoutines();

  const ordered = orderDates(patch.startDate ?? current.startDate, patch.endDate ?? current.endDate);
  const update = {
    title: patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title,
    memo: patch.memo !== undefined ? patch.memo.trim() : current.memo,
    start_date: ordered.startDate,
    end_date: ordered.endDate,
  };

  const { error } = await getSupabaseServerClient()
    .from("routines")
    .update(update)
    .eq("id", routineId)
    .eq("user_id", loginId);

  if (error) {
    if (isMissingRoutinesTableError(error)) {
      await updateRoutineInGoalRows(loginId, routineId, patch, current);
      return readRoutinesFromGoalRows(loginId);
    }
    throw error;
  }
  return readRoutines();
}

export async function deleteRoutine(routineId: string) {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient()
    .from("routines")
    .delete()
    .eq("id", routineId)
    .eq("user_id", loginId);

  if (error) {
    if (isMissingRoutinesTableError(error)) {
      const { error: moveError } = await getSupabaseServerClient()
        .from("goals")
        .update({ deleted_at_ms: Date.now(), archived_at_ms: null })
        .eq("id", routineId)
        .eq("user_id", loginId)
        .eq("unit", ROUTINE_GOAL_UNIT);
      if (moveError) throw moveError;
      return readRoutinesFromGoalRows(loginId);
    }
    throw error;
  }
  return readRoutines();
}

export async function archiveRoutine(routineId: string) {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient()
    .from("goals")
    .update({ archived_at_ms: Date.now(), deleted_at_ms: null })
    .eq("id", routineId)
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT);
  if (error) throw error;
  return readRoutinesFromGoalRows(loginId);
}

export async function restoreRoutine(routineId: string) {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient()
    .from("goals")
    .update({ archived_at_ms: null, deleted_at_ms: null, position: -1 })
    .eq("id", routineId)
    .eq("user_id", loginId)
    .eq("unit", ROUTINE_GOAL_UNIT);
  if (error) throw error;
  return {
    routines: await readRoutines(),
    archivedRoutines: await readArchivedRoutines(),
    deletedRoutines: await readDeletedRoutines(),
  };
}

export async function permanentlyDeleteRoutine(routineId: string) {
  const loginId = await requireLoginId();
  await deleteRoutineFromGoalRows(loginId, routineId);
  return { deletedRoutines: await readDeletedRoutines() };
}

export async function setRoutineMark(routineId: string, date: string, status: RoutineMarkStatus) {
  const loginId = await requireLoginId();
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) throw new Error("Valid date is required");

  const { data: routine, error: routineError } = await getSupabaseServerClient()
    .from("routines")
    .select("id,start_date,end_date")
    .eq("id", routineId)
    .eq("user_id", loginId)
    .maybeSingle();

  if (routineError) {
    if (isMissingRoutinesTableError(routineError)) {
      const routine = (await readRoutinesFromGoalRows(loginId)).find((item) => item.id === routineId);
      if (!routine) return readRoutinesFromGoalRows(loginId);
      if (normalizedDate < routine.startDate || normalizedDate > routine.endDate) {
        throw new Error("Date is outside the routine range");
      }
      await setRoutineMarkInGoalRows(routineId, normalizedDate, status);
      return readRoutinesFromGoalRows(loginId);
    }
    throw routineError;
  }
  if (!routine) return readRoutines();
  if (normalizedDate < routine.start_date || normalizedDate > routine.end_date) {
    throw new Error("Date is outside the routine range");
  }

  const mark = {
    id: makeId("routine-mark"),
    routine_id: routineId,
    date: normalizedDate,
    status,
    created_at_ms: Date.now(),
  };

  const { error } = await getSupabaseServerClient()
    .from("routine_marks")
    .upsert(mark, { onConflict: "routine_id,date" });

  if (error) {
    if (isMissingRoutinesTableError(error)) {
      await setRoutineMarkInGoalRows(routineId, normalizedDate, status);
      return readRoutinesFromGoalRows(loginId);
    }
    throw error;
  }
  return readRoutines();
}

export async function clearRoutineMark(routineId: string, date: string) {
  const loginId = await requireLoginId();
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) throw new Error("Valid date is required");

  const { data: routine, error: routineError } = await getSupabaseServerClient()
    .from("routines")
    .select("id")
    .eq("id", routineId)
    .eq("user_id", loginId)
    .maybeSingle();

  if (routineError) {
    if (isMissingRoutinesTableError(routineError)) {
      const routine = (await readRoutinesFromGoalRows(loginId)).find((item) => item.id === routineId);
      if (!routine) return readRoutinesFromGoalRows(loginId);
      await deleteFallbackMarksForDate(routineId, normalizedDate);
      return readRoutinesFromGoalRows(loginId);
    }
    throw routineError;
  }
  if (!routine) return readRoutines();

  const { error } = await getSupabaseServerClient()
    .from("routine_marks")
    .delete()
    .eq("routine_id", routineId)
    .eq("date", normalizedDate);

  if (error) {
    if (isMissingRoutinesTableError(error)) {
      await deleteFallbackMarksForDate(routineId, normalizedDate);
      return readRoutinesFromGoalRows(loginId);
    }
    throw error;
  }
  return readRoutines();
}
