# Storage and Permission Contracts

Read the relevant store's conversion helpers before changing persisted behavior. This document explains why those helpers matter; it does not replace their current field mappings.

## Representations and Lifecycle

| Item | Dedicated representation | Compatibility and archive/bin representation |
| --- | --- | --- |
| Goal | `goals` with `progress_entries` | Same tables, filtered by archive/delete state |
| Todo | `todos` | `goals` using unit `__todo__` and todo memo markers |
| Routine | `routines` with `routine_marks` | `goals` using unit `__routine__` and routine memo markers, with marks represented through `progress_entries` |

`todoStore.ts` detects a missing `public.todos` table using `PGRST205` and falls back to goal rows. `routineStore.ts` similarly detects missing routines/marks tables. Keep fallback detection specific to the intended schema condition; permission, network, and other DB errors should retain their current error behavior.

Even with dedicated tables installed, todo and routine archive/bin operations move data into goal rows. Restoration reconstructs the dedicated row when supported. Updating an item may also target a stored goal row if no dedicated row was updated. A new field therefore needs attention in more than the dedicated table insert and select.

When changing a field, trace:

1. Input validation, defaults, and the public item type.
2. Dedicated insert, select, and update mappings.
3. Goal-row encoding and decoding, including memo metadata and overloaded columns.
4. Archive/bin moves and restoration, including child entries or marks.
5. Client state/API responses and any assignment payload or detail reader that handles the field.

Check ID continuity, ordering, completion/focus state, dates, categories/memos, and progress/marks as relevant to the request. Do not assume serialized memo strings are user prose. Use the store's structured metadata parsing/serialization helpers.

`goalStore.ts` excludes todo and routine compatibility rows from ordinary goals. Preserve that distinction in new goal queries and summaries.

## Schema Evolution

The initial schema is in `supabase/schema.sql`; incremental migrations are in `supabase/migrations/`. Typed Supabase rows/inserts/updates live in `lib/supabase.ts`. Reconcile all applicable definitions for new fields, constraints, or tables.

Existing compatibility code also handles some missing columns in authentication/admin/settings flows. Inspect the affected `isMissing...` helper to decide how a new migration interacts with older deployments. Do not suppress arbitrary database errors or remove fallback behavior as an incidental refactor.

Date-only fields generally use `YYYY-MM-DD`; created/archive/delete timestamps use millisecond numbers. Routine date helpers normalize and order bounds, and mark mutations check the date against the owning routine's range. Preserve the relevant representation and bounds checks.

## Ownership and Shared Data

`app_users.login_id` is the application's user identity. Server stores obtain it through `requireLoginId()` and constrain operations accordingly. The service-role client bypasses RLS, even though the schema enables RLS. Parent ownership checks are needed before mutating goal entries and routine marks.

`friendStore.ts` checks friendship and assignment participants. Accepted assignments can create actual goals, todos, or routines, and assignment detail readers understand compatibility data. Inspect these readers when changing fields exposed in shared-item observations.

## AI Access and Credentials

`lib/auth.ts` defines AI eligibility and admin identity; `lib/adminStore.ts` manages users' `ai_enabled` flag. Preserve the distinction between being allowed to use AI and being allowed to manage shared credentials.

`agentSettingsStore.ts` stores encrypted keys and supports multiple keys with an active selection. It uses `AGENT_SETTINGS_SECRET`, then `AUTH_SECRET`, then the Supabase service-role secret as encryption-secret fallbacks. UI responses use masked previews. Keep credential selection/decryption on the server and preserve the existing encryption contract when changing settings.

Both `/api/agent` and `/api/agent/actions` call `requireAgentAccess()`. The first accepts prompt/apply/list/history input; the second applies explicit actions. When extending actions, use existing stores instead of introducing direct DB writes that bypass compatibility or ownership checks.
