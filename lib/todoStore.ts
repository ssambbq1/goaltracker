import { ensureAppUser, requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  deletedAt?: number;
  archivedAt?: number;
};

const TODO_GOAL_MEMO = "__boostmaster_todo__";
const TODO_GOAL_UNIT = "__todo__";
const TODO_COMPLETED_DEADLINE = "completed";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingTodosTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "PGRST205" && String(record.message ?? "").includes("public.todos");
}

async function readTodosFromGoalRows(loginId: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("goals")
    .select("id,title,deadline,created_at_ms,deleted_at_ms,archived_at_ms")
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT)
    .is("deleted_at_ms", null)
    .is("archived_at_ms", null)
    .order("position", { ascending: true })
    .order("created_at_ms", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: todo.deadline === TODO_COMPLETED_DEADLINE,
    createdAt: todo.created_at_ms,
    deletedAt: todo.deleted_at_ms ?? undefined,
    archivedAt: todo.archived_at_ms ?? undefined,
  }));
}

async function readStoredTodoGoalRows(
  loginId: string,
  kind: "archived" | "deleted",
) {
  const query = getSupabaseServerClient()
    .from("goals")
    .select("id,title,deadline,created_at_ms,deleted_at_ms,archived_at_ms")
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT);

  const { data, error } =
    kind === "archived"
      ? await query.is("deleted_at_ms", null).not("archived_at_ms", "is", null).order("archived_at_ms", { ascending: false })
      : await query.not("deleted_at_ms", "is", null).order("deleted_at_ms", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: todo.deadline === TODO_COMPLETED_DEADLINE,
    createdAt: todo.created_at_ms,
    deletedAt: todo.deleted_at_ms ?? undefined,
    archivedAt: todo.archived_at_ms ?? undefined,
  }));
}

async function addTodoToGoalRows(loginId: string, todo: Todo) {
  const { error } = await getSupabaseServerClient().from("goals").insert({
    id: todo.id,
    user_id: loginId,
    title: todo.title,
    memo: TODO_GOAL_MEMO,
    target: 1,
    unit: TODO_GOAL_UNIT,
    deadline: todo.completed ? TODO_COMPLETED_DEADLINE : "",
    created_at_ms: todo.createdAt,
    deleted_at_ms: todo.deletedAt ?? null,
    archived_at_ms: todo.archivedAt ?? null,
    position: -1,
  });

  if (error) throw error;
}

async function moveTodoFromTodosToGoalRows(loginId: string, todoId: string, destination: "archive" | "trash") {
  const supabase = getSupabaseServerClient();
  const { data: todo, error: readError } = await supabase
    .from("todos")
    .select("id,title,completed,created_at_ms")
    .eq("id", todoId)
    .eq("user_id", loginId)
    .maybeSingle();
  if (readError) throw readError;

  if (todo) {
    const movedAt = Date.now();
    await addTodoToGoalRows(loginId, {
      id: todo.id,
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.created_at_ms,
      archivedAt: destination === "archive" ? movedAt : undefined,
      deletedAt: destination === "trash" ? movedAt : undefined,
    });
    const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("user_id", loginId);
    if (error) throw error;
    return;
  }

  const update =
    destination === "archive"
      ? { archived_at_ms: Date.now(), deleted_at_ms: null }
      : { deleted_at_ms: Date.now(), archived_at_ms: null };
  const { error } = await supabase
    .from("goals")
    .update(update)
    .eq("id", todoId)
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT);
  if (error) throw error;
}

async function restoreTodoFromGoalRows(loginId: string, todoId: string) {
  const supabase = getSupabaseServerClient();
  const { data: todo, error: readError } = await supabase
    .from("goals")
    .select("id,title,deadline,created_at_ms")
    .eq("id", todoId)
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT)
    .maybeSingle();
  if (readError) throw readError;
  if (!todo) return;

  const { error: insertError } = await supabase.from("todos").insert({
    id: todo.id,
    user_id: loginId,
    title: todo.title,
    completed: todo.deadline === TODO_COMPLETED_DEADLINE,
    created_at_ms: todo.created_at_ms,
    position: -1,
  });

  if (insertError) {
    if (isMissingTodosTableError(insertError)) {
      const { error } = await supabase
        .from("goals")
        .update({ deleted_at_ms: null, archived_at_ms: null, position: -1 })
        .eq("id", todoId)
        .eq("user_id", loginId)
        .eq("memo", TODO_GOAL_MEMO)
        .eq("unit", TODO_GOAL_UNIT);
      if (error) throw error;
      return;
    }
    throw insertError;
  }

  await deleteTodoFromGoalRows(loginId, todoId);
}

async function updateTodoInGoalRows(
  loginId: string,
  todoId: string,
  patch: Partial<Pick<Todo, "title" | "completed">>,
) {
  const update: { title?: string; deadline?: string } = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title) update.title = title;
  }

  if (patch.completed !== undefined) {
    update.deadline = patch.completed ? TODO_COMPLETED_DEADLINE : "";
  }

  if (!Object.keys(update).length) return;

  const { error } = await getSupabaseServerClient()
    .from("goals")
    .update(update)
    .eq("id", todoId)
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT);

  if (error) throw error;
}

async function deleteTodoFromGoalRows(loginId: string, todoId: string) {
  const { error } = await getSupabaseServerClient()
    .from("goals")
    .delete()
    .eq("id", todoId)
    .eq("user_id", loginId)
    .eq("memo", TODO_GOAL_MEMO)
    .eq("unit", TODO_GOAL_UNIT);

  if (error) throw error;
}

export async function readTodos() {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", loginId)
    .order("position", { ascending: true })
    .order("created_at_ms", { ascending: false });

  if (error) {
    if (isMissingTodosTableError(error)) return readTodosFromGoalRows(loginId);
    throw error;
  }

  return (data ?? []).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    createdAt: todo.created_at_ms,
  }));
}

export async function readArchivedTodos() {
  return readStoredTodoGoalRows(await requireLoginId(), "archived");
}

export async function readDeletedTodos() {
  return readStoredTodoGoalRows(await requireLoginId(), "deleted");
}

export async function addTodo(title: string) {
  const loginId = await requireLoginId();
  await ensureAppUser(loginId);
  const supabase = getSupabaseServerClient();
  const todo: Todo = {
    id: makeId("todo"),
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };
  const active = await readTodos();

  const { error } = await supabase.from("todos").insert({
    id: todo.id,
    user_id: loginId,
    title: todo.title,
    completed: todo.completed,
    created_at_ms: todo.createdAt,
    position: active.length ? -1 : 0,
  });

  if (error) {
    if (isMissingTodosTableError(error)) {
      await addTodoToGoalRows(loginId, todo);
      return { todo, todos: await readTodosFromGoalRows(loginId) };
    }
    throw error;
  }
  return { todo, todos: await readTodos() };
}

export async function reorderTodos(todoIds: string[]) {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const active = await readTodos();
  const knownActiveIds = new Set(active.map((todo) => todo.id));
  const orderedIds = [
    ...todoIds.filter((todoId) => knownActiveIds.has(todoId)),
    ...active.map((todo) => todo.id).filter((todoId) => !todoIds.includes(todoId)),
  ];

  const updates = orderedIds.map((todoId, index) =>
    supabase.from("todos").update({ position: index }).eq("id", todoId).eq("user_id", loginId),
  );
  const results = await Promise.all(updates);
  const missingTodosTableError = results.find((result) => result.error && isMissingTodosTableError(result.error));

  if (missingTodosTableError) {
    await Promise.all(
      orderedIds.map((todoId, index) =>
        supabase
          .from("goals")
          .update({ position: index })
          .eq("id", todoId)
          .eq("user_id", loginId)
          .eq("memo", TODO_GOAL_MEMO)
          .eq("unit", TODO_GOAL_UNIT)
          .throwOnError(),
      ),
    );
    return readTodosFromGoalRows(loginId);
  }

  const updateError = results.find((result) => result.error)?.error;
  if (updateError) throw updateError;

  return readTodos();
}

export async function updateTodo(todoId: string, patch: Partial<Pick<Todo, "title" | "completed">>) {
  const loginId = await requireLoginId();
  const update: { title?: string; completed?: boolean } = {};

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title) update.title = title;
  }

  if (patch.completed !== undefined) update.completed = patch.completed;

  if (Object.keys(update).length) {
    const { error } = await getSupabaseServerClient()
      .from("todos")
      .update(update)
      .eq("id", todoId)
      .eq("user_id", loginId);

    if (error) {
      if (isMissingTodosTableError(error)) {
        await updateTodoInGoalRows(loginId, todoId, patch);
        return readTodosFromGoalRows(loginId);
      }
      throw error;
    }
  }

  return readTodos();
}

export async function deleteTodo(todoId: string) {
  const loginId = await requireLoginId();
  await moveTodoFromTodosToGoalRows(loginId, todoId, "trash");
  return readTodos();
}

export async function archiveTodo(todoId: string) {
  const loginId = await requireLoginId();
  await moveTodoFromTodosToGoalRows(loginId, todoId, "archive");
  return readTodos();
}

export async function restoreTodo(todoId: string) {
  const loginId = await requireLoginId();
  await restoreTodoFromGoalRows(loginId, todoId);
  return {
    todos: await readTodos(),
    archivedTodos: await readArchivedTodos(),
    deletedTodos: await readDeletedTodos(),
  };
}

export async function permanentlyDeleteTodo(todoId: string) {
  const loginId = await requireLoginId();
  await deleteTodoFromGoalRows(loginId, todoId);
  return { deletedTodos: await readDeletedTodos() };
}
