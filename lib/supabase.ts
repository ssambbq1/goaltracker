import { createClient } from "@supabase/supabase-js";

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          login_id: string;
          google_user_id: string | null;
          google_email: string | null;
          display_name: string | null;
          password_hash: string | null;
          created_at_ms: number;
          last_login_at_ms: number;
        };
        Insert: {
          login_id: string;
          google_user_id?: string | null;
          google_email?: string | null;
          display_name?: string | null;
          password_hash?: string | null;
          created_at_ms: number;
          last_login_at_ms: number;
        };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Insert"]>;
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          memo: string;
          target: number;
          unit: string;
          deadline: string;
          created_at_ms: number;
          deleted_at_ms: number | null;
          archived_at_ms: number | null;
          position: number;
        };
        Insert: {
          id: string;
          user_id?: string | null;
          title: string;
          memo?: string;
          target: number;
          unit?: string;
          deadline?: string;
          created_at_ms: number;
          deleted_at_ms?: number | null;
          archived_at_ms?: number | null;
          position?: number;
        };
        Update: Partial<Database["public"]["Tables"]["goals"]["Insert"]>;
        Relationships: [];
      };
      progress_entries: {
        Row: {
          id: string;
          goal_id: string;
          created_at_ms: number;
          value: number;
          memo: string;
        };
        Insert: {
          id: string;
          goal_id: string;
          created_at_ms: number;
          value: number;
          memo?: string;
        };
        Update: Partial<Database["public"]["Tables"]["progress_entries"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "progress_entries_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type SupabaseAuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  isServer?: boolean;
};

export function getSupabaseAuthClient(storage?: SupabaseAuthStorage) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and Supabase auth key");
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: Boolean(storage),
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage,
    },
  });
}
