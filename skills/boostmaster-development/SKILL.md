---
name: boostmaster-development
description: Implement, debug, or review changes in the BoostMaster (boost-mastery) Next.js and Supabase project, preserving goal, todo, and routine storage compatibility, account permissions, and AI action contracts. Use for this repository or its checkouts.
---

# BoostMaster Development

Use this skill for work in BoostMaster. Locate the repository from the current workspace; identify it using `package.json` (`boost-mastery`) and its actual source. Paths below are relative to that repository, not to the installed skill directory. Treat the source as authoritative when it differs from these notes.

## Find the Change Path

Read the repository's `AGENTS.md`. Before writing application code, read the relevant guides in `node_modules/next/dist/docs/`; this repository explicitly requires local documentation for its installed Next.js version.

For feature location and cross-layer dependencies, read [references/project-map.md](references/project-map.md). Trace the requested behavior from the client handler through the Route Handler into the store before editing. `GoalTracker.tsx` contains much of the UI, request helpers, and client types; search for the specific handler or view instead of loading the entire file.

## Preserve Storage and Lifecycle Contracts

Before changing persisted fields, todo/routine CRUD, or archive/bin behavior, read [references/storage-contracts.md](references/storage-contracts.md).

Todo and routine compatibility representations in `goals` are part of current behavior. Archive/bin operations use those representations even when dedicated tables exist. Check serialization, reads, updates, and restoration for each changed field. Keep ordinary goal queries from treating compatibility rows as goals.

For database changes, add an incremental migration under `supabase/migrations/`, update `supabase/schema.sql` for fresh installations, and update the typed database definitions in `lib/supabase.ts` as applicable. Determine how the change behaves before the migration is applied using the existing missing-table/column handling. Creating a migration does not authorize executing it against a remote database.

## Keep Permissions on the Server

Use the existing authentication and store helpers. `getSupabaseServerClient()` uses a service-role key, so RLS alone does not enforce user ownership for these calls. Scope user-owned reads and mutations to the authenticated login ID; for child rows, verify ownership through their parent. For friendships and assignments, follow the participant checks in `friendStore.ts` rather than imposing a blanket current-user filter on intentionally shared data.

Keep Supabase service-role keys and decrypted AI credentials out of client imports, response payloads, logs, and skill resources. Preserve admin checks for user AI access and agent settings management. Preserve `requireAgentAccess()` on both AI execution endpoints.

Session handling is custom signed-cookie authentication in `lib/auth.ts`, alongside provider login routes. Inspect that implementation before changing login or account behavior.

## Coordinate Client, API, and Agent Changes

Keep client types and fetch helpers, API request/response shapes, and store types consistent. Check `/api/bootstrap` when changing initial-load data. Follow the relevant route's current Node runtime, dynamic behavior, and error handling; consult local Next.js documentation before changing them.

For UI changes, preserve existing Korean/English labels and persisted navigation/settings behavior where affected. Check loading, failure, empty, and success states for the changed interaction, including narrow screens when layout changes.

For AI command changes, trace `runListAgent()` and `applyAgentActions()` in `lib/listAgent.ts`. Coordinate the server action union, action validation/application, and the client `AgentAction` type and presentation in `GoalTracker.tsx`. Preserve the current preview/apply behavior. Use the existing stores for mutations so the same ownership and fallback rules apply to AI and ordinary UI actions.

Use the existing date and query helpers when the behavior fits: `parseDatePhrase.ts`, `taskQueryFilters.ts`, and `routineAgentSummary.ts`. Check date-only strings and millisecond timestamps against the store types instead of converting them interchangeably.

## Verify the Affected Behavior

Choose checks based on the change. For app code, run relevant tests and lint/type checks; run a build when routes, imports, configuration, or rendering behavior warrant it. For a small documentation change, validate the documents and links without requiring app tests.

- Run tests once with `npx vitest run`; `npm test` invokes Vitest's watch mode.
- Existing focused tests cover Korean date parsing, overdue filters, and routine summaries. They do not establish database lifecycle or permission correctness.
- For storage changes, verify the dedicated-table path and applicable fallback path, including an archive/bin-to-restore round trip with the changed fields. Use isolated fixtures or mocks for automated verification.
- For permission changes, check an unauthenticated request and an attempt to access another user's item, in addition to the authorized case.
- For user-facing changes, exercise the modified interaction in a running app when available and report any verification that requires unavailable credentials or services.

Report the resulting behavior, checks performed, and any migration the user needs to apply. Keep remote deployment, database execution, and publication within the user's requested scope.
