# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Specification

**Start here:** [docs/spec/handoff.md](docs/spec/handoff.md) — current state, what was last worked on, open design questions. Read before picking up work.

Open work is tracked in [BACKLOG.md](BACKLOG.md). Map rendering — the terrain layer, its palette and its constraints — is documented in [docs/rendering.md](docs/rendering.md). The game is deployed at https://supply-chain-sim.lucasjohnston.nl; see [docs/deployment.md](docs/deployment.md).

Read the relevant engine spec file before touching any engine module. Read [docs/spec/design-principles.md](docs/spec/design-principles.md) before any feature work or UI/UX decisions.

| Spec file | Contents |
|-----------|----------|
| [handoff.md](docs/spec/handoff.md) | Current state, open threads, known traps — read first |
| [design-principles.md](docs/spec/design-principles.md) | Nine core design principles that govern all gameplay decisions |
| [glossary.md](docs/spec/glossary.md) | Definitions of Corporation, Firm, Contract, Tender, Ramp, Chaos engine, and all key terms |
| [config-reference.md](docs/spec/config-reference.md) | Full GameConfig TypeScript block with all tunable numeric parameters |
| [product-roadmap.md](docs/spec/product-roadmap.md) | Post-MVP feature roadmap across supply chains, cities, AI, finance, contracts, retail, and game experience |
| [known-gaps.md](docs/spec/known-gaps.md) | Ten known MVP gaps; includes MVP 2.0 priority list |
| [engine/tick.md](docs/spec/engine/tick.md) | Turn sequence orchestration and TickResult |
| [engine/winCondition.md](docs/spec/engine/winCondition.md) | Win/loss detection, simultaneous win rules, AI elimination |
| [engine/macroEvents.md](docs/spec/engine/macroEvents.md) | Recession, commodity shocks, interest rate events, barcode unlock |
| [engine/harbor.md](docs/spec/engine/harbor.md) | Harbor product list, spot pricing, price noise and shock displacement |
| [engine/products.md](docs/spec/engine/products.md) | Product registry: metadata, helpers, storage eligibility rules |
| [engine/investments.md](docs/spec/engine/investments.md) | Investment lifecycle, payment spreading, startup phase, gate on completion |
| [engine/production.md](docs/spec/engine/production.md) | Farm seasonal multipliers, factory recipes, per-line progress tracking |
| [engine/contracts.md](docs/spec/engine/contracts.md) | Contract types, breach conditions, gate system, renewal scheduling, fines |
| [engine/tenders.md](docs/spec/engine/tenders.md) | Tender lifecycle, award, renewal cycle, incumbent notice, bid eligibility |
| [engine/retail.md](docs/spec/engine/retail.md) | Demand pipeline, S-curve ramp, elasticity, recession, harbor auto-buy |
| [engine/loans.md](docs/spec/engine/loans.md) | Variable rate loans, payment recalculation, leverage limits |
| [engine/operatingCosts.md](docs/spec/engine/operatingCosts.md) | Deduction order, training cost, quality trajectory, startup cost fraction |
| [engine/ai.md](docs/spec/engine/ai.md) | AI decision loop, expansion rules, bid pricing, training inheritance |
| [engine/books.md](docs/spec/engine/books.md) | P&L bucketing, net worth, internal transfer exclusion, turn selector |
| [engine/history.md](docs/spec/engine/history.md) | Rolling 40-turn EconomicSnapshot, what is recorded per turn |
| [engine/map.md](docs/spec/engine/map.md) | Node topology, Dijkstra transport cost, harbor access rules |
| [engine/city.md](docs/spec/engine/city.md) | Wealth drift, demand multiplier formula, industrial bonus stub |
| [engine/milestones.md](docs/spec/engine/milestones.md) | €100k revenue unlock for multi-year contracts; business dev tree placeholder |
| [engine/newGame.md](docs/spec/engine/newGame.md) | Initial state assembly, AI seeding, makeFirm factory |

## Commands

```bash
npm run dev        # start dev server (Vite HMR)
npm run build      # tsc -b && vite build
npm run lint       # eslint
```

No test suite. For engine validation, run the headless simulation:
```bash
npx tsx src/simulation/headless.ts
```

## Architecture

**Stack:** React 19 + TypeScript + Vite. State management: Zustand (`src/store/gameStore.ts`). No backend — everything runs in-browser.

### Data flow

```
tick(state) → TickResult
     ↓
gameStore.endTurn() reads TickResult, pushes gate actions or notifications,
sets phase/showWinScreen, stores lastTickResult
     ↓
React components read from useGameStore()
```

`GameState` (defined in `src/types/index.ts`) is the single source of truth. All engine functions **mutate it in place** — no immutability. The store wraps mutations with `immer`-style `set()` calls but the engine itself does not use immer.

### Key directories

- `src/engine/` — pure game logic, no React. Each file owns one domain.
- `src/store/gameStore.ts` — Zustand store; bridges engine ↔ UI; owns gate queue, notifications, screen state.
- `src/components/screens/` — full-page screens (one per nav tab + Start/Win/Loss).
- `src/components/panels/` — persistent panels (RightPanel, BottomBar).
- `src/config/gameConfig.ts` — **all numeric constants live here**. Never hardcode gameplay values in engine files.
- `src/types/index.ts` — all shared types. `GameState` is the root.

### Core classifications

**Node types** (`NodeType` union: `"city" | "harbor" | "port" | "airport"`):
- `city` — every procedurally generated land node. Has `factorySlots` for production firms and `storeLocations` (A/B/C classes) for retail stores.
- `port` — a city promoted during generation: sits near a canvas edge, `harborAccess: true`, fixed A1/B2/C3 store layout, `"Port "` name prefix.
- `harbor` — the standalone International Harbor node (no firms can be built here).
- `airport` — declared but never generated; reserved for post-MVP logistics.

> `"town"` was removed from `NodeType`. `factorySlots` was formerly `productionSlots`. Both renames are complete across engine, store, and UI — do not reintroduce the old names.

`factorySlots` is derived from population alone (≥300k → 6, ≥150k → 4, ≥60k → 3, else 2). See [engine/map.md](docs/spec/engine/map.md).

**Firm subtypes** (`FirmType` union: `"farm" | "factory" | "store" | "mine" | "logistics_facility"`):
- Production firms (`farm`, `factory`, `mine`) consume `factorySlots` on a CityNode and use `GameConfig.firmInvestmentSlotLimit` (flat 8) for investments.
- `store` — consumes `storeSlots` on a CityNode, keyed by `locationClass` (`"A" | "B" | "C"`) and `size` (`"small" | "medium" | "large"`). Investment slots are size-based (`GameConfig.storeSlots.investmentSlotsBySize`). Store sections (grocery, electronics, etc.) determine which products can be sold. Stores do **not** use the production-firm investment list. Store firms open `StoreFirmOverview` (full-screen) rather than the RightPanel FirmPanel.

**Store slot accounting**: each store occupies `GameConfig.storeSlots.citySlotsBySize[size]` units (1/2/3) from the city's slot class bucket (`storeSlots.A`, `.B`, or `.C`). Slot availability is checked in `gameStore.buildFirm()`.

### Engine modules

| File | Responsibility |
|------|---------------|
| `tick.ts` | Orchestrates turn sequence (16 steps); catches `BankruptcyError`; returns `TickResult` |
| `newGame.ts` | Constructs initial `GameState`; exports `makeFirm` factory |
| `contracts.ts` | Executes contracts, tracks breach counters, issues `BreachGateProposal`, `executeBreachDeclaration` |
| `tenders.ts` | Tender lifecycle: evaluate bids, award, renewal via `pendingTenderRenewals` |
| `retail.ts` | B2C sales with S-curve ramp, price elasticity, city demand multiplier |
| `investments.ts` | Advance build turns, startup phase, paused-investment detection |
| `production.ts` | Recipe execution per production line, seasonal multipliers |
| `ai.ts` | AI decision loop: expand firms, bid tenders, manage supply |
| `map.ts` | Procedural map generation from seed + `MapConfig`; `getTransportCost` (Dijkstra) |
| `city.ts` | `tickPopulation` (logistic growth), `tickWealth`, `computeNetworkFactor`, demand/elasticity helpers |
| `bankruptcy.ts` | `requireCash` (throws `BankruptcyError` for player), `eliminateCorporation` (for AI) |
| `books.ts` | P&L / balance sheet computation for the Books screen |
| `operatingCosts.ts` | Deduct per-turn overhead; `getProductionLineQuality` |
| `macroEvents.ts` | Recession, commodity shocks, interest rate events |
| `harbor.ts` | Harbor price ticking with noise and active shocks |

### Map generation

The map is **procedurally generated**, never hardcoded. `newGame(playerName, mapConfig?)` draws a random seed and calls `buildCityNodes` then `buildMapLinks`. `MapConfig` (in `types/index.ts`, defaults + presets in `gameConfig.ts`) controls node count, ports, zone weights, road density (`connectivity`), guaranteed links per node (`minimumDegree`), and the highway network (`infrastructure`).

Two constraints that are easy to break:
- **`buildMapLinks` replays `buildCityNodes` Step 1** with the same seed to recover region centres and zone characters. Adding or removing an RNG draw in that step desynchronises the replay. `[MAP-VERIFY]` console logs exist to check this.
- **`highwayMaxDistance` and `networkPopRadiusPx` are in canvas pixels, not km**, so both are coupled to `canvasWidth`/`canvasHeight`.

All link distances are clamped to `[20, 100]` km regardless of screen geometry. Full detail in [engine/map.md](docs/spec/engine/map.md).

### Screens

`activeScreen` (Zustand) drives the nav tabs. Two screens render outside that switch:
- `CityScreen` — opens via `selectedCityScreenId` when a map node is clicked. Population/wealth charts, city character badges.
- `StoreFirmOverview` — opens via `selectedStoreFirmId`; store firms use this instead of the RightPanel FirmPanel.
- `StartScreen` — rendered whenever `gameState` is null. Landing mode (name + Quick Game) and config mode (map presets + individual `MapConfig` controls).

`NodeMap` unmounts when CityScreen opens, so pan/zoom lives in the store as `mapTransform`, not local state.

### Bankruptcy pattern

Any engine step that involves player cash must call `requireCash(state, corpId, amount, obligationLabel)`. This throws `BankruptcyError` if the player can't pay. `tick()` catches it, sets `state.phase = "lost"`, and returns immediately. For AI corporations, call `eliminateCorporation` instead — it sets `corp.eliminated = true` and removes their firms.

### Gate queue

Player decisions that can't be auto-resolved (e.g. breach declarations) go through the gate system. `tick()` returns `breachGateProposals` in `TickResult`. The store converts these to `GateAction` entries with a stable ID (`gate-breach-{contractId}`). `GatePrompt` renders the first pending gate. Once the player acts, `resolveGateAction` removes it from the queue.

### Tender renewal cycle

When a market contract expires naturally or via breach, the engine pushes to `state.pendingTenderRenewals`. `processRenewals()` (called each tick) converts pending renewals into new `Tender` entries after the configured gap (`tenders.renewalGapTurns`).

### Transaction ledger

`postTransaction()` appends to `state.transactions`. Trimmed to a rolling 40-turn window. Used by Books screen, Products trend indicators, and `estimateTurnsToBankruptcy`.

### Adding a new product

1. Add the `ProductId` to the union in `types/index.ts`
2. Register it in `src/engine/products.ts` (the product registry drives what's valid where)
3. Add prices/elasticity to `gameConfig.ts` as needed
4. Add a production recipe in `gameConfig.ts` if it's manufactured

### Headless simulation

`src/simulation/headless.ts` runs a scripted game without React — useful for tuning balance. Run with `npx tsx`. It uses the same `tick()` / engine functions as the live game.
