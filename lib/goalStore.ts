import { getSupabaseServerClient } from "@/lib/supabase";

export type ProgressEntry = {
  id: string;
  createdAt: number;
  value: number;
  memo: string;
};

export type Goal = {
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

export type NewGoalInput = {
  title: string;
  memo: string;
  target: number;
  unit: string;
  deadline: string;
};

export type NewEntryInput = {
  value: number;
  memo: string;
  createdAt?: number;
};

export type EntryPatchInput = Partial<NewEntryInput>;

function applyGoalPatch(
  goal: Goal,
  patch: Partial<Pick<Goal, "title" | "memo" | "target" | "unit" | "deadline">>,
) {
  return {
    ...goal,
    title: patch.title !== undefined && patch.title.trim() ? patch.title.trim() : goal.title,
    memo: patch.memo !== undefined ? patch.memo : goal.memo,
    target: patch.target !== undefined && patch.target > 0 ? patch.target : goal.target,
    unit: patch.unit !== undefined && patch.unit.trim() ? patch.unit.trim() : goal.unit,
    deadline: patch.deadline !== undefined ? patch.deadline : goal.deadline,
  };
}

function activeGoals(goals: Goal[]) {
  return goals.filter((goal) => goal.deletedAt === undefined && goal.archivedAt === undefined);
}

function deletedGoals(goals: Goal[]) {
  return goals
    .filter((goal) => goal.deletedAt !== undefined)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

function archivedGoals(goals: Goal[]) {
  return goals
    .filter((goal) => goal.deletedAt === undefined && goal.archivedAt !== undefined)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}

async function readStoredGoals() {
  const supabase = getSupabaseServerClient();
  const { data: goalRows, error: goalsError } = await supabase
    .from("goals")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at_ms", { ascending: false });

  if (goalsError) throw goalsError;
  if (!goalRows.length) return [];

  const goalIds = goalRows.map((goal) => goal.id);
  const { data: entryRows, error: entriesError } = await supabase
    .from("progress_entries")
    .select("*")
    .in("goal_id", goalIds)
    .order("created_at_ms", { ascending: true });

  if (entriesError) throw entriesError;

  const entriesByGoal = new Map<string, ProgressEntry[]>();
  for (const entry of entryRows ?? []) {
    const entries = entriesByGoal.get(entry.goal_id) ?? [];
    entries.push({
      id: entry.id,
      createdAt: entry.created_at_ms,
      value: entry.value,
      memo: entry.memo,
    });
    entriesByGoal.set(entry.goal_id, entries);
  }

  return goalRows.map((goal) => ({
    id: goal.id,
    title: goal.title,
    memo: goal.memo,
    target: goal.target,
    unit: goal.unit,
    deadline: goal.deadline,
    createdAt: goal.created_at_ms,
    deletedAt: goal.deleted_at_ms ?? undefined,
    archivedAt: goal.archived_at_ms ?? undefined,
    entries: entriesByGoal.get(goal.id) ?? [],
  }));
}

export async function readGoals() {
  return activeGoals(await readStoredGoals());
}

export async function readDeletedGoals() {
  return deletedGoals(await readStoredGoals());
}

export async function readArchivedGoals() {
  return archivedGoals(await readStoredGoals());
}

export async function writeGoals(goals: Goal[]) {
  const supabase = getSupabaseServerClient();
  const goalRows = goals.map((goal, index) => ({
    id: goal.id,
    title: goal.title,
    memo: goal.memo,
    target: goal.target,
    unit: goal.unit,
    deadline: goal.deadline,
    created_at_ms: goal.createdAt,
    deleted_at_ms: goal.deletedAt ?? null,
    archived_at_ms: goal.archivedAt ?? null,
    position: index,
  }));
  const entryRows = goals.flatMap((goal) =>
    goal.entries.map((entry) => ({
      id: entry.id,
      goal_id: goal.id,
      created_at_ms: entry.createdAt,
      value: entry.value,
      memo: entry.memo,
    })),
  );

  const { error: upsertGoalsError } = await supabase.from("goals").upsert(goalRows);
  if (upsertGoalsError) throw upsertGoalsError;

  const { error: deleteEntriesError } = await supabase.from("progress_entries").delete().neq("id", "");
  if (deleteEntriesError) throw deleteEntriesError;

  if (entryRows.length) {
    const { error: upsertEntriesError } = await supabase.from("progress_entries").upsert(entryRows);
    if (upsertEntriesError) throw upsertEntriesError;
  }
}

export async function reorderGoals(goalIds: string[]) {
  const supabase = getSupabaseServerClient();
  const active = await readGoals();
  const knownActiveIds = new Set(active.map((goal) => goal.id));
  const orderedIds = [
    ...goalIds.filter((goalId) => knownActiveIds.has(goalId)),
    ...active.map((goal) => goal.id).filter((goalId) => !goalIds.includes(goalId)),
  ];

  await Promise.all(
    orderedIds.map((goalId, index) =>
      supabase
        .from("goals")
        .update({ position: index })
        .eq("id", goalId)
        .is("deleted_at_ms", null)
        .is("archived_at_ms", null)
        .throwOnError(),
    ),
  );

  return readGoals();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function addGoal(input: NewGoalInput) {
  const supabase = getSupabaseServerClient();
  const active = await readGoals();
  const goal: Goal = {
    id: makeId("goal"),
    title: input.title.trim(),
    memo: input.memo.trim(),
    target: Number.isFinite(input.target) && input.target > 0 ? input.target : 1,
    unit: input.unit.trim() || "units",
    deadline: input.deadline,
    createdAt: Date.now(),
    entries: [],
  };

  const { error } = await supabase.from("goals").insert({
    id: goal.id,
    title: goal.title,
    memo: goal.memo,
    target: goal.target,
    unit: goal.unit,
    deadline: goal.deadline,
    created_at_ms: goal.createdAt,
    position: active.length ? -1 : 0,
  });

  if (error) throw error;
  return { goal, goals: await readGoals() };
}

export async function updateGoal(
  goalId: string,
  patch: Partial<Pick<Goal, "title" | "memo" | "target" | "unit" | "deadline">>,
) {
  const goal = (await readGoals()).find((item) => item.id === goalId);
  if (!goal) return readGoals();

  const nextGoal = applyGoalPatch(goal, patch);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("goals")
    .update({
      title: nextGoal.title,
      memo: nextGoal.memo,
      target: nextGoal.target,
      unit: nextGoal.unit,
      deadline: nextGoal.deadline,
    })
    .eq("id", goalId)
    .is("deleted_at_ms", null)
    .is("archived_at_ms", null);

  if (error) throw error;
  return readGoals();
}

export async function deleteGoal(goalId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("goals")
    .update({ deleted_at_ms: Date.now(), archived_at_ms: null })
    .eq("id", goalId)
    .is("deleted_at_ms", null);

  if (error) throw error;
  const goals = await readStoredGoals();
  return { goals: activeGoals(goals), deletedGoals: deletedGoals(goals) };
}

export async function archiveGoal(goalId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("goals")
    .update({ archived_at_ms: Date.now() })
    .eq("id", goalId)
    .is("deleted_at_ms", null)
    .is("archived_at_ms", null);

  if (error) throw error;
  const goals = await readStoredGoals();
  return { goals: activeGoals(goals), archivedGoals: archivedGoals(goals) };
}

export async function restoreGoal(goalId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("goals")
    .update({ deleted_at_ms: null, archived_at_ms: null, position: -1 })
    .eq("id", goalId);

  if (error) throw error;
  const goals = await readStoredGoals();
  return {
    goals: activeGoals(goals),
    deletedGoals: deletedGoals(goals),
    archivedGoals: archivedGoals(goals),
  };
}

export async function permanentlyDeleteGoal(goalId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("goals").delete().eq("id", goalId).not("deleted_at_ms", "is", null);
  if (error) throw error;
  const goals = await readStoredGoals();
  return { goals: activeGoals(goals), deletedGoals: deletedGoals(goals) };
}

export async function addEntry(goalId: string, input: NewEntryInput) {
  const createdAt =
    typeof input.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : Date.now();
  const entry: ProgressEntry = {
    id: makeId("entry"),
    createdAt,
    value: Number.isFinite(input.value) ? Math.max(0, input.value) : 0,
    memo: input.memo.trim(),
  };
  const supabase = getSupabaseServerClient();
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .is("deleted_at_ms", null)
    .is("archived_at_ms", null)
    .maybeSingle();

  if (goalError) throw goalError;

  if (goal) {
    const { error } = await supabase.from("progress_entries").insert({
      id: entry.id,
      goal_id: goalId,
      created_at_ms: entry.createdAt,
      value: entry.value,
      memo: entry.memo,
    });
    if (error) throw error;
  }

  return { entry, goals: await readGoals() };
}

export async function updateEntry(goalId: string, entryId: string, patch: EntryPatchInput) {
  const goals = await readGoals();
  const currentEntry = goals.find((goal) => goal.id === goalId)?.entries.find((entry) => entry.id === entryId);
  if (!currentEntry) return goals;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("progress_entries")
    .update({
      value:
        patch.value !== undefined && Number.isFinite(patch.value)
          ? Math.max(0, patch.value)
          : currentEntry.value,
      memo: patch.memo !== undefined ? patch.memo.trim() : currentEntry.memo,
      created_at_ms:
        typeof patch.createdAt === "number" && Number.isFinite(patch.createdAt)
          ? patch.createdAt
          : currentEntry.createdAt,
    })
    .eq("id", entryId)
    .eq("goal_id", goalId);

  if (error) throw error;
  return readGoals();
}

export async function deleteEntry(goalId: string, entryId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("progress_entries").delete().eq("id", entryId).eq("goal_id", goalId);
  if (error) throw error;
  return readGoals();
}
