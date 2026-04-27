# CLAUDE.md — Vinyan UI

Frontend POC for the Vinyan agent backend. React 19 + Vite + TypeScript (strict) + Tailwind v4. Talks to a backend on `http://127.0.0.1:3927` via the Vite dev proxy.

This file gives you the **map and the rules**. Concrete details (routes, endpoints, event names, timeouts, store contents) live in the code — read it instead of trusting any list you might find here.

## Read these before changing anything

- `package.json` — scripts, deps, versions
- `vite.config.ts` — dev port, proxy targets, alias
- `tsconfig.json` — strictness, path alias
- `src/App.tsx` — current route table (source of truth)
- `src/main.tsx` — provider stack
- `src/lib/api-client.ts` — typed API surface and fetch wrapper (source of truth for endpoints)
- `src/lib/query-keys.ts` — query-key factory (`qk.*`)
- `src/lib/query-client.ts` — TanStack Query defaults
- `src/lib/phases.ts` — phase ordering / metadata (must match backend)
- `src/hooks/use-streaming-turn.ts` — pure reducer + Zustand store for live chat bubbles (source of truth for streaming event names)
- `src/hooks/use-chat.ts` — send-message mutation, optimistic update, error path
- `src/hooks/use-sse-sync.ts` + `src/lib/use-sse.ts` — global SSE consumer
- `src/index.css` — Tailwind entry + `@theme` design tokens

If a section of this file looks stale relative to the code, **trust the code** and update this file as part of your change.

## Golden rules

- Use **bun**. Never npm/yarn/pnpm. Lockfile is `bun.lock`.
- Strict TypeScript. Don't widen to `any` to silence the compiler — fix the type, or use `unknown` + narrow casts (the existing reducer follows that pattern).
- Use the `@/*` alias for new imports; don't introduce deep `../../..` chains.
- Tailwind v4: utilities only. Add design tokens to the `@theme` block in `src/index.css` before reaching for arbitrary hex values. There is no `tailwind.config.js` and there should not be one.
- Dark mode is the only theme (hard-coded in `index.html`). Do not add a light-mode toggle unless asked.
- This is a POC. Do not add tests, ESLint/Prettier, CI, Dockerfiles, or production hardening unless explicitly asked. Lint = `tsc --noEmit`.
- Never `git commit` / `push` / `tag` without explicit per-turn authorization (see user-global rules).

## Commands

- `bun install` — install
- `bun run dev` — dev server (requires backend on :3927)
- `bun run lint` — `tsc --noEmit`. Run after any non-trivial TS change.
- `bun run build` — full type-check + bundle. Run before declaring a refactor complete.
- No test runner. Don't add one.

## Architecture in one screen

- **Routing** — lazy-loaded pages registered in `src/App.tsx`, rendered inside the layout in `src/layouts/`. Adding a route means: a file in `src/pages/`, a `<Route>` in `App.tsx`, and (if user-facing) a sidebar entry in the layout.
- **Server state** — TanStack Query everywhere. Keys come from `qk.*` in `src/lib/query-keys.ts` — never hand-write a key array. Hooks in `src/hooks/use-<resource>.ts` wrap one resource each.
- **Client state** — Zustand stores in `src/store/` (events log, SSE-connected flag, toasts). The streaming-turn store is co-located with its reducer in `src/hooks/use-streaming-turn.ts` because that's where it's consumed.
- **HTTP** — only via `api.*` in `src/lib/api-client.ts`. Don't call `fetch` directly from components or hooks.
- **Realtime** — two SSE channels:
  - Global event bus (`EventSource`) → invalidates queries via `use-sse-sync`.
  - Per-turn message stream (SSE-over-POST) → reduced into a live bubble by `reduceTurn` in `use-streaming-turn.ts`.
- **Auth** — bootstrap fetches a bearer token at startup and persists it to `localStorage`. Localhost-only; do not assume it works in a deployed env.

## Extension recipes

**New page**
1. Add `src/pages/<name>.tsx` with a default export.
2. Register the route in `src/App.tsx`.
3. If user-facing, add a sidebar entry in the layout.
4. Update the route-table mention in `README.md` only if the page is operator-visible — otherwise let `App.tsx` be the source of truth.

**New backend resource**
1. Add the response type and an `api.<resource>()` method in `src/lib/api-client.ts`.
2. Add a key under `qk` in `src/lib/query-keys.ts`.
3. Add `src/hooks/use-<resource>.ts` (TanStack Query).
4. If the resource is mutated by SSE, wire invalidation in `src/hooks/use-sse-sync.ts`.

**New streaming event**
1. Update `reduceTurn` in `src/hooks/use-streaming-turn.ts` (it's a pure function — keep it pure).
2. Update the `StreamingTurn` shape if needed; consumers that read it will type-error.
3. Update the chat components in `src/components/chat/` that render the affected fields.

**New global state**
1. New Zustand slice in `src/store/`. Don't graft onto an unrelated store.
2. Keep server-cacheable data in TanStack Query, not Zustand.

**Styling**
- Compose existing utilities. If you need a new colour/spacing/radius, add a token to the `@theme` block in `src/index.css` first. The `cn()` helper in `src/lib/utils.ts` is the canonical way to merge class names.

## Common pitfalls

- The Vite proxy targets `127.0.0.1` (not `localhost`) — keep it that way to avoid IPv6 lookup quirks on macOS.
- `tsc -b` writes `tsconfig.tsbuildinfo`. If type errors look stale, delete that file and re-run.
- React 19: some libraries still ship React 18 types. Ignore peer warnings unless they actually break the build.
- `bootstrapAuth` retries forever in the background. A "stuck" UI almost always means the backend on :3927 is down — not a UI bug.
- The streaming-turn store's `clear()` is a deliberate no-op while a turn is `running`. To force-clear after a fetch error, call `setError(...)` first; `useSendMessage.onError` already does this — mirror that pattern in any new send path.
- `phase:timing` events fire **after** a phase completes; the reducer advances `currentPhase` to the *next* phase. Don't "fix" this without a coordinated backend change.
- The `/ecp/*` proxy is declared in `vite.config.ts` but currently unused by the UI. Confirm the intent with the backend owner before deleting or wiring it.

## Out of scope (do not do unless asked)

- Test framework, ESLint, Prettier, CI
- Light-mode / theme toggle
- Switching package manager
- Backend changes (this repo is UI only)
- Production deployment artifacts (Dockerfile, env-based config, CSP, …)

## File-touch checklist

Before reporting "done":

1. `bun run lint` passes.
2. If you changed a public-facing pattern (route shape, store API, SSE event handling, API client conventions), the relevant section of this file still describes reality — update it in the same change.
3. If you changed an architectural pointer in this file (e.g. moved a module), update the **Read these before changing anything** list too.
