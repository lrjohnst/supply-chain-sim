# ReadmeClaude.md

This file is for future Claude instances working on this project. It describes the development procedure and context.

---

## What this project is

A turn-based supply chain economy simulation game. One country, one AI rival, five supply chains, 200 turns. The player builds a corporate empire starting in 1980 with €100k. Win condition: €5M net worth.

Full design context lives in the game concept documents shared in the chat. The MVP design document (v1.x) is the authoritative spec. Always ask the user for the latest version before making structural changes.

---

## Architecture

**Hard rule: no game logic in React components.**

- `src/types/index.ts` — all entity types
- `src/config/gameConfig.ts` — every numeric parameter. Nothing hardcoded in logic.
- `src/engine/` — pure TypeScript. `tick.ts` is the entry point.
- `src/store/gameStore.ts` — Zustand store. Bridges player actions to the engine.
- `src/components/` — React UI. Reads state, renders, calls store actions.
- `src/simulation/headless.ts` — simulation harness for tuning and diagnosis.

**Turn sequence in `tick.ts`:**
1. Fire macro events
2. Advance investments
3. Run production
4. Execute contracts
5. Evaluate tenders
6. Retail sales
7. Process loans
8. Operating costs + quality
9. AI decisions
10. Generate upcoming events
11. Win check
12. Advance turn counter

---

## Development procedure

### Starting a new session
1. Read `CHANGELOG.md` to know what version you're on and what's done.
2. Ask the user for the latest MVP design document if making structural changes.
3. Run `npx tsc --noEmit` before touching anything to confirm clean baseline.
4. Run the headless simulation (`npx tsx src/simulation/headless.ts`) to get a feel for current balance.

### Making changes
- Config tuning: edit `gameConfig.ts` only, then re-run simulation.
- Engine changes: update types first if needed, then engine, then store, then UI.
- Always run `npx tsc --noEmit` after changes. Zero errors before committing.

### Committing
Commit message format: `v[X.Y] [Short description of what this version contains]`

Example: `v1.0 Engine + UI: tick loop, five supply chains, node map, books, tender board`

This makes version history readable at a glance in GitHub.

---

## Known sharp edges

- `GameState` is mutated in place by the engine. The Zustand store triggers re-renders by spreading: `set({ gameState: { ...gameState } })`.
- Internal contracts post zero-cash transactions for firm-level book clarity. Don't mistake these for bugs.
- The AI has no harbor sourcing mechanism as of v1.0 — it expands firms but never fills them with inventory.
- Vite 5 is pinned because the system runs Node 20.16 (Vite 6 requires 20.19+).

---

## Tech stack

- React 19 + TypeScript
- Vite 5
- Zustand (state management)
- Pure SVG for the node map (no mapping library)
- tsx for running TypeScript scripts directly
