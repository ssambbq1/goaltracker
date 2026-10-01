# Project Map

Verified against the repository on 2026-10-02. Recheck relevant source before relying on these locations after a refactor.

## Architecture

`app/page.tsx` renders the client `app/components/GoalTracker.tsx`. Client request helpers call `app/api/**/route.ts`; Route Handlers call server-side stores under `lib/`, which use the Supabase client from `lib/supabase.ts`.

The installed stack at inspection was Next.js 16.2.9, React 19.2.4, Tailwind 4, TypeScript, Supabase JS, and Vitest. Read `package.json` and local Next.js docs for the current checkout's versions and APIs.

## Feature Locations

| Behavior | Primary source | Related source to inspect |
| --- | --- | --- |
| Main views, navigation, requests, client state/types | `app/components/GoalTracker.tsx` | `app/globals.css`, corresponding API route |
| Goals and progress entries | `lib/goalStore.ts`, `app/api/goals/` | `app/components/ProgressChart.tsx` |
| Todos, completion, dates, categories | `lib/todoStore.ts`, `app/api/todos/` | `lib/parseDatePhrase.ts`, `lib/taskQueryFilters.ts` |
| Routines and daily marks | `lib/routineStore.ts`, `app/api/routines/` | `app/components/RoutineTracker.tsx`, `lib/routineAgentSummary.ts` |
| Initial session and lists | `app/api/bootstrap/route.ts` | `getAccountProfile`, `readGoals`, `readTodos`, `readRoutines` |
| Login, signed sessions, account deletion | `lib/auth.ts`, `app/api/auth/` | Google/Kakao callback routes, `lib/supabase.ts` |
| Friends and shared assignments | `lib/friendStore.ts` | `app/api/friends/`, `app/api/assignments/` |
| Admin user list and AI access | `lib/adminStore.ts`, `app/api/admin/users/route.ts` | `isAdminIdentity`, `canCurrentUserUseAi` in `lib/auth.ts` |
| Announcements | `lib/announcementStore.ts`, `app/api/announcements/route.ts` | Announcement state in `GoalTracker.tsx` |
| AI planning and action application | `lib/listAgent.ts` | `app/api/agent/route.ts`, `app/api/agent/actions/route.ts`, client action type/UI |
| AI credentials and model settings | `lib/agentSettingsStore.ts` | `app/api/agent/settings/route.ts`, admin settings UI |
| PWA/install/display | `app/manifest.ts`, `app/layout.tsx` | `AppInstallButton.tsx`, `AppDisplayMode.tsx`, `public/sw.js`, `next.config.ts` |
| DB types and clients | `lib/supabase.ts` | `supabase/schema.sql`, `supabase/migrations/` |

## Useful Search Anchors

In `GoalTracker.tsx`, search for the API URL, item type, or visible label associated with the request. Local storage helpers cover navigation, language, theme, ordering, filters, chart modes, and agent controls. Check both state updates and persistence when changing those behaviors.

In `listAgent.ts`, search for `AgentAction`, `runListAgent`, `applyAgentActions`, and the action's discriminant. Inspect both planning and application rather than assuming a new action is handled throughout.

In stores, search for `readArchived`, `readDeleted`, `restore`, `GoalRows`, `isMissing`, and `user_id`. These reveal compatibility and ownership paths that an active-list query can miss.

On PowerShell, use `Get-Content -LiteralPath` when reading dynamic-route paths containing brackets, such as `app/api/goals/[goalId]/route.ts`.

## Verification Commands

- `npx vitest run` runs all current tests once; append a specific test path for a focused run.
- `npm run lint` runs ESLint.
- `npx tsc --noEmit` checks types against the current TypeScript configuration.
- `npm run build` checks the production build when relevant.
- `npm run dev` starts the local app; use an available port and provide its actual URL when the task needs an interactive preview.

Current tests: `tests/parseDatePhrase.test.ts`, `tests/taskQueryFilters.test.ts`, and `tests/routineAgentSummary.test.ts`.
