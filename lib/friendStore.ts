import { addGoal, type NewGoalInput } from "@/lib/goalStore";
import { addRoutine, type NewRoutineInput } from "@/lib/routineStore";
import { addTodo } from "@/lib/todoStore";
import { requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type FriendProfile = {
  loginId: string;
  displayName: string | null;
};

export type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  respondedAt?: number;
  friend: FriendProfile;
  direction: "sent" | "received";
};

export type AssignmentKind = "goal" | "todo" | "routine";

export type Assignment = {
  id: string;
  assignerId: string;
  assigneeId: string;
  kind: AssignmentKind;
  title: string;
  memo: string;
  target?: number;
  unit?: string;
  deadline?: string;
  startDate?: string;
  endDate?: string;
  targetDate?: string;
  category: string;
  status: "pending" | "accepted" | "declined";
  appliedItemId?: string;
  createdAt: number;
  respondedAt?: number;
  assigner?: FriendProfile;
  assignee?: FriendProfile;
  observed?: AssignedObservation | null;
};

export type AssignedObservation = {
  kind: AssignmentKind;
  id: string;
  title: string;
  statusText: string;
  progressText: string;
  updatedAt?: number;
};

export type AssignmentInput =
  | ({ kind: "goal" } & NewGoalInput & { assigneeId: string })
  | ({ kind: "todo"; assigneeId: string; title: string; targetDate: string; category?: string; memo?: string })
  | ({ kind: "routine" } & NewRoutineInput & { assigneeId: string });

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDate(value: string | undefined) {
  const date = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function assertTitle(title: string) {
  const normalized = title.trim();
  if (!normalized) throw new Error("Title is required.");
  return normalized;
}

async function getProfiles(loginIds: string[]) {
  const uniqueIds = Array.from(new Set(loginIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, FriendProfile>();

  const { data, error } = await getSupabaseServerClient()
    .from("app_users")
    .select("login_id,display_name")
    .in("login_id", uniqueIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((user) => [
      user.login_id,
      {
        loginId: user.login_id,
        displayName: user.display_name ?? null,
      },
    ]),
  );
}

function mapFriendship(
  row: {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted" | "declined";
    created_at_ms: number;
    responded_at_ms: number | null;
  },
  loginId: string,
  profiles: Map<string, FriendProfile>,
): Friendship {
  const friendId = row.requester_id === loginId ? row.addressee_id : row.requester_id;
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at_ms,
    respondedAt: row.responded_at_ms ?? undefined,
    friend: profiles.get(friendId) ?? { loginId: friendId, displayName: null },
    direction: row.requester_id === loginId ? "sent" : "received",
  };
}

function mapAssignment(
  row: {
    id: string;
    assigner_id: string;
    assignee_id: string;
    kind: AssignmentKind;
    title: string;
    memo: string;
    target: number | null;
    unit: string | null;
    deadline: string | null;
    start_date: string | null;
    end_date: string | null;
    target_date: string | null;
    category: string;
    status: "pending" | "accepted" | "declined";
    applied_item_id: string | null;
    created_at_ms: number;
    responded_at_ms: number | null;
  },
  profiles: Map<string, FriendProfile>,
): Assignment {
  return {
    id: row.id,
    assignerId: row.assigner_id,
    assigneeId: row.assignee_id,
    kind: row.kind,
    title: row.title,
    memo: row.memo,
    target: row.target ?? undefined,
    unit: row.unit ?? undefined,
    deadline: row.deadline ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    targetDate: row.target_date ?? undefined,
    category: row.category ?? "",
    status: row.status,
    appliedItemId: row.applied_item_id ?? undefined,
    createdAt: row.created_at_ms,
    respondedAt: row.responded_at_ms ?? undefined,
    assigner: profiles.get(row.assigner_id),
    assignee: profiles.get(row.assignee_id),
  };
}

export async function searchUsersByNickname(query: string) {
  const loginId = await requireLoginId();
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await getSupabaseServerClient()
    .from("app_users")
    .select("login_id,display_name")
    .or(`display_name.ilike.%${term.replaceAll("%", "\\%")}%,login_id.ilike.%${term.replaceAll("%", "\\%")}%`)
    .neq("login_id", loginId)
    .limit(10);
  if (error) throw error;

  return (data ?? []).map((user) => ({
    loginId: user.login_id,
    displayName: user.display_name ?? null,
  }));
}

export async function readFriendships() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${loginId},addressee_id.eq.${loginId}`)
    .order("created_at_ms", { ascending: false });
  if (error) throw error;

  const profiles = await getProfiles((data ?? []).flatMap((friendship) => [friendship.requester_id, friendship.addressee_id]));
  return (data ?? []).map((friendship) => mapFriendship(friendship, loginId, profiles));
}

export async function requestFriend(addresseeId: string) {
  const requesterId = await requireLoginId();
  const friendId = addresseeId.trim();
  if (!friendId || friendId === requesterId) throw new Error("Choose another user.");

  const left = requesterId < friendId ? requesterId : friendId;
  const right = requesterId < friendId ? friendId : requesterId;
  const supabase = getSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from("friendships")
    .select("id,status")
    .or(`and(requester_id.eq.${left},addressee_id.eq.${right}),and(requester_id.eq.${right},addressee_id.eq.${left})`)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "accepted") throw new Error("Already friends.");
  if (existing?.status === "pending") throw new Error("Friend request is already pending.");

  const { error } = await supabase.from("friendships").insert({
    id: makeId("friendship"),
    requester_id: requesterId,
    addressee_id: friendId,
    status: "pending",
    created_at_ms: Date.now(),
  });
  if (error) throw error;
  return readFriendships();
}

export async function respondToFriendship(friendshipId: string, status: "accepted" | "declined") {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient()
    .from("friendships")
    .update({ status, responded_at_ms: Date.now() })
    .eq("id", friendshipId)
    .eq("addressee_id", loginId)
    .eq("status", "pending");
  if (error) throw error;
  return readFriendships();
}

export async function assertAcceptedFriend(leftId: string, rightId: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${leftId},addressee_id.eq.${rightId}),and(requester_id.eq.${rightId},addressee_id.eq.${leftId})`)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("You can assign items only to accepted friends.");
}

export async function createAssignment(input: AssignmentInput) {
  const assignerId = await requireLoginId();
  await assertAcceptedFriend(assignerId, input.assigneeId);

  const now = Date.now();
  const row = {
    id: makeId("assignment"),
    assigner_id: assignerId,
    assignee_id: input.assigneeId,
    kind: input.kind,
    title: assertTitle(input.title),
    memo: "memo" in input ? (input.memo ?? "").trim() : "",
    target: input.kind === "goal" ? (Number.isFinite(input.target) ? input.target : 1) : null,
    unit: input.kind === "goal" ? input.unit.trim() || "units" : null,
    deadline: input.kind === "goal" ? normalizeDate(input.deadline) : null,
    start_date: input.kind === "routine" ? normalizeDate(input.startDate) || normalizeDate(input.endDate) : null,
    end_date: input.kind === "routine" ? normalizeDate(input.endDate) || normalizeDate(input.startDate) : null,
    target_date: input.kind === "todo" ? normalizeDate(input.targetDate) : null,
    category: input.kind === "todo" ? (input.category ?? "").trim().slice(0, 64) : "",
    status: "pending" as const,
    created_at_ms: now,
  };
  if (input.kind === "todo" && !row.target_date) throw new Error("Task target date is required.");
  if (input.kind === "routine" && (!row.start_date || !row.end_date)) throw new Error("Habit date range is required.");

  const { error } = await getSupabaseServerClient().from("item_assignments").insert(row);
  if (error) throw error;
  return readAssignments();
}

export async function readAssignments() {
  const loginId = await requireLoginId();
  const { data, error } = await getSupabaseServerClient()
    .from("item_assignments")
    .select("*")
    .or(`assigner_id.eq.${loginId},assignee_id.eq.${loginId}`)
    .order("created_at_ms", { ascending: false });
  if (error) throw error;

  const profiles = await getProfiles((data ?? []).flatMap((assignment) => [assignment.assigner_id, assignment.assignee_id]));
  const assignments = (data ?? []).map((assignment) => mapAssignment(assignment, profiles));
  const observations = await readObservations(assignments.filter((assignment) => assignment.assignerId === loginId));
  return assignments.map((assignment) => ({
    ...assignment,
    observed: observations.get(assignment.id) ?? null,
  }));
}

async function readObservations(assignments: Assignment[]) {
  const result = new Map<string, AssignedObservation>();
  const supabase = getSupabaseServerClient();

  for (const assignment of assignments) {
    if (assignment.status !== "accepted" || !assignment.appliedItemId) continue;

    if (assignment.kind === "goal") {
      const { data: goal, error: goalError } = await supabase
        .from("goals")
        .select("id,title,target,unit,created_at_ms")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (goalError) throw goalError;
      if (!goal) continue;
      const { data: entries, error: entriesError } = await supabase
        .from("progress_entries")
        .select("value,created_at_ms")
        .eq("goal_id", goal.id)
        .order("created_at_ms", { ascending: false })
        .limit(1);
      if (entriesError) throw entriesError;
      const latest = entries?.[0];
      result.set(assignment.id, {
        kind: "goal",
        id: goal.id,
        title: goal.title,
        statusText: "Accepted",
        progressText: `${latest?.value ?? 0} / ${goal.target} ${goal.unit}`,
        updatedAt: latest?.created_at_ms ?? goal.created_at_ms,
      });
    }

    if (assignment.kind === "todo") {
      const { data: todo, error } = await supabase
        .from("todos")
        .select("id,title,completed,created_at_ms,target_date")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (error) throw error;
      if (!todo) continue;
      result.set(assignment.id, {
        kind: "todo",
        id: todo.id,
        title: todo.title,
        statusText: todo.completed ? "Completed" : "Not completed",
        progressText: todo.target_date ? `Target ${todo.target_date}` : "No target date",
        updatedAt: todo.created_at_ms,
      });
    }

    if (assignment.kind === "routine") {
      const { data: routine, error } = await supabase
        .from("routines")
        .select("id,title,start_date,end_date,created_at_ms")
        .eq("id", assignment.appliedItemId)
        .eq("user_id", assignment.assigneeId)
        .maybeSingle();
      if (error) throw error;
      if (!routine) continue;
      const { count, error: countError } = await supabase
        .from("routine_marks")
        .select("id", { count: "exact", head: true })
        .eq("routine_id", routine.id)
        .eq("status", "success");
      if (countError) throw countError;
      result.set(assignment.id, {
        kind: "routine",
        id: routine.id,
        title: routine.title,
        statusText: "Accepted",
        progressText: `${count ?? 0} success marks`,
        updatedAt: routine.created_at_ms,
      });
    }
  }

  return result;
}

export async function respondToAssignment(assignmentId: string, status: "accepted" | "declined") {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data: assignment, error: readError } = await supabase
    .from("item_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("assignee_id", loginId)
    .eq("status", "pending")
    .maybeSingle();
  if (readError) throw readError;
  if (!assignment) return readAssignments();

  let appliedItemId: string | null = null;
  if (status === "accepted") {
    if (assignment.kind === "goal") {
      const result = await addGoal({
        title: assignment.title,
        memo: assignment.memo,
        target: assignment.target ?? 1,
        unit: assignment.unit ?? "units",
        deadline: assignment.deadline ?? "",
      });
      appliedItemId = result.goal.id;
    } else if (assignment.kind === "todo") {
      const result = await addTodo(assignment.title, assignment.target_date ?? "", assignment.category ?? "");
      appliedItemId = result.todo.id;
    } else {
      const result = await addRoutine({
        title: assignment.title,
        memo: assignment.memo,
        startDate: assignment.start_date ?? "",
        endDate: assignment.end_date ?? "",
      });
      appliedItemId = result.routine.id;
    }
  }

  const { error } = await supabase
    .from("item_assignments")
    .update({ status, applied_item_id: appliedItemId, responded_at_ms: Date.now() })
    .eq("id", assignmentId)
    .eq("assignee_id", loginId);
  if (error) throw error;
  return readAssignments();
}
