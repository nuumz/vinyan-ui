# Vinyan UI

Frontend console for the Vinyan agent backend — streams agent turns, tool calls, plan steps, and verdicts; surfaces operator views (sessions, tasks, traces, skills, etc.).

> **Status:** POC under `appl/POC/`. No tests, no CI, single-developer.

## Stack

- **Runtime:** Bun
- **Framework:** React 19 + Vite 6
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`, no `tailwind.config.js`)
- **Routing:** react-router-dom v7
- **Server state:** @tanstack/react-query v5
- **Client state:** Zustand
- **Markdown:** react-markdown + remark-gfm + rehype-highlight
- **Charts:** recharts
- **Icons:** lucide-react

Authoritative versions live in `package.json`.

## Prerequisites

- Bun ≥ 1.x
- Vinyan **backend** running on `http://127.0.0.1:3927` (target of the dev proxy in `vite.config.ts`). Without it the UI bootstraps but most calls 502.

## Quick start

```bash
bun install
bun run dev      # http://localhost:4000
```

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Vite dev server, ports/proxies in `vite.config.ts` |
| `bun run build` | Type-check + production bundle to `dist/` |
| `bun run preview` | Serve the production bundle locally |
| `bun run lint` | `tsc --noEmit` (no ESLint configured) |

## Project layout

```
src/
  App.tsx            Route table (lazy-loaded pages)
  main.tsx           React root + global providers
  index.css          Tailwind v4 entry + design tokens (@theme)
  layouts/           App shell (sidebar, header, auth bootstrap)
  pages/             One file per route
  components/
    chat/            Streaming chat UI (bubbles, phase timeline, tool cards, ...)
    ui/              Generic primitives (card, badge, tabs, skeleton, ...)
  hooks/             Query/mutation hooks + streaming-turn reducer
  lib/               api-client, query-client, query-keys, sse, utilities
  store/             Zustand stores
```

For the **current** route list, read `src/App.tsx`. For the **current** API surface, read `src/lib/api-client.ts`. Both are the source of truth — do not duplicate them here.

## Architecture

- **Routing.** Pages are lazy-loaded in `src/App.tsx` and rendered inside the app layout in `src/layouts/`.
- **Server state.** TanStack Query. Query keys are centralised in `src/lib/query-keys.ts` (`qk.*`). Defaults in `src/lib/query-client.ts`.
- **Client state.** Zustand stores in `src/store/` (events log, SSE-connected flag, toasts). Streaming-turn state lives co-located with its reducer in `src/hooks/use-streaming-turn.ts`.
- **Backend client.** All HTTP goes through `api.*` in `src/lib/api-client.ts` (typed methods, JSON-only fetch wrapper with timeout/retry).
- **Auth.** A bearer token is fetched once at startup and persisted to `localStorage`. Localhost-convenience only — not a deploy-ready scheme.
- **Realtime.** Two SSE channels:
  - **Global event bus** (`EventSource`) — drives query invalidation and the Events page. Wrapper in `src/lib/use-sse.ts`, sync logic in `src/hooks/use-sse-sync.ts`.
  - **Per-turn streaming** — `POST` to the messages endpoint with `{ stream: true }`; response body is an SSE stream consumed by `api.sendMessageStream()` and reduced into a live bubble by `src/hooks/use-streaming-turn.ts`.
- **Phases.** Phase metadata (label, icon, ordering) lives in `src/lib/phases.ts` and must match the backend phase loop.

## Styling

Tailwind v4 utilities only. Design tokens are declared in `src/index.css` under a `@theme { ... }` block — extend that block before reaching for arbitrary hex values. Dark mode is the only theme (`<html class="dark">` is hard-coded in `index.html`). Use the `cn()` helper in `src/lib/utils.ts` to merge classes.

## Conventions

- Path alias `@/*` → `src/*` (configured in `tsconfig.json` and `vite.config.ts`).
- Strict TypeScript — avoid `any`; prefer `unknown` + narrowing.
- File names: kebab-case. Components: PascalCase. One page per file in `src/pages/`.
- Pages use default exports (for `React.lazy`); everything else uses named exports.

## Troubleshooting

- **`/api` calls 502 / "Connecting…" never resolves** — backend on `127.0.0.1:3927` is down. The auth bootstrap retries with backoff, so it self-heals once the backend comes up.
- **Stale type errors** — delete `tsconfig.tsbuildinfo` and re-run `bun run lint`.
- **SSE shows "Disconnected"** — auto-reconnects on focus, online, and a watchdog timer; or click Retry in the header.
- **Auth wedged** — clear `localStorage['vinyan-token']` and reload.

## License

Private / unreleased.
