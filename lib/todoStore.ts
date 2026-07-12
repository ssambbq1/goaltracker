import { requireLoginId } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function readTodos() {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", loginId)
    .order("created_at_ms", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    createdAt: todo.created_at_ms,
  }));
}

export async function addTodo(title: string) {
  const loginId = await requireLoginId();
  const supabase = getSupabaseServerClient();
  const todo: Todo = {
    id: makeId("todo"),
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };

  const { error } = await supabase.from("todos").insert({
    id: todo.id,
    user_id: loginId,
    title: todo.title,
    completed: todo.completed,
    created_at_ms: todo.createdAt,
  });

  if (error) throw error;
  return { todo, todos: await readTodos() };
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

    if (error) throw error;
  }

  return readTodos();
}

export async function deleteTodo(todoId: string) {
  const loginId = await requireLoginId();
  const { error } = await getSupabaseServerClient().from("todos").delete().eq("id", todoId).eq("user_id", loginId);
  if (error) throw error;
  return readTodos();
}
