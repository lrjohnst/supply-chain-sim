# Handoff — current state and open threads

*Last updated: 2026-09-10*

Read this first when picking up work. [known-gaps.md](known-gaps.md) describes the MVP 1.0 era and is **not** current.

---

## Remote

`https://github.com/lrjohnst/supply-chain-sim` — configured locally as `origin`, not yet pushed.

---

## Where things stand

The map system was rebuilt from hardcoded 16-node topology to full procedural generation, and a new-game configuration screen was added on top of it.

**Done and committed:**

- **Procedural map generation** — seeded RNG, region centres with zone characters, lognormal populations, Gaussian scatter placement, port promotion. Replaces the old hardcoded map entirely.
- **`MapConfig` parameterisation** — `connectivity` (isolated/sparse/dense), `minimumDegree` (0–3), `infrastructure` (undeveloped→advanced) replacing the old conflated `density` field. Named presets: `europeanMapConfig`, `developingMapConfig`, `frontierMapConfig`, `industrialMapConfig`.
- **MST highway network** — Prim's over a population-gated candidate set, replacing the old `highwayFraction` random selection.
- **`StartScreen`** — landing mode (Quick Game) plus config mode exposing presets and every individual `MapConfig` control.
- **Link distance clamp** — every link is 20–100km regardless of on-screen geometry.
- **`productionSlots` → `factorySlots`**, `"town"` removed from `NodeType`, pan/zoom lifted into the store as `mapTransform`.

See [engine/map.md](engine/map.md) and [engine/city.md](engine/city.md) for full behavior.

---

## Open thread: the map may be redesigned

**This is the live question.** The node-graph map is logically sound but reads as too abstract — the player sees topology, not a region. They cannot form a mental model of geography, so "this city is remote" is a data point rather than something felt.

The idea under consideration is a **grid of squares** instead of a free-form node graph. Three shapes were sketched:

- **A — grid cells are cities.** Each tile is one city, adjacency is connection. Simplest and most readable, but loses road-quality variation and the topology mechanics.
- **B — terrain grid with cities on top.** Cells are terrain (plains, mountain, coast, industrial); cities sit on cells; roads still drawn explicitly between them. Preserves the existing graph engine and adds geographic narrative — a mountain range visibly explains why two regions are separate. **This was the recommendation.**
- **C — grid of regions.** 9–16 region tiles, each containing several cities, click to zoom in. Addresses map clutter at 50 nodes.

The open question put to the user and **not yet answered**: is the problem *readability* (knowing where things are relative to each other) or *feel* (it should look like a region, not a diagram)? The answer decides between B and C.

Relevant: [product-roadmap.md](product-roadmap.md) already lists "Full hex grid world map with ocean links between countries", so a tile-based map is a direction the project had anticipated.

If Option B is chosen, the existing `buildMapLinks` topology work survives intact — only a terrain-assignment step in generation and a tile renderer in `NodeMap` are new.

---

## Earlier design observation worth keeping

The user is from the Netherlands and noted the generated map does not feel like a Western European region: real cities there are densely packed, nearly every settlement has three or more connections, and dead-end settlements are rare.

Two contributing factors were identified:
1. **Scale.** The default 2000×1400 canvas at `SCALE_FACTOR ≈ 0.328` represents roughly 448,000 km² — Montana-sized — for 50 nodes. Genuinely sparse.
2. **Zone clustering.** Zones cluster rather than interleave, so regions read as separate blobs.

`minimumDegree` and the population-gravity term in `computeNetworkFactor` address the symptoms. The scale question is unresolved and would be settled naturally by a grid map with an explicit cell size.

---

## Known traps

- **RNG replay coupling.** `buildMapLinks` replays `buildCityNodes` Step 1 to recover zone characters. Any change to the number or order of RNG draws in that step breaks it silently. `[MAP-VERIFY]` logs exist to check; they are development-only and safe to delete once you stop touching generation.
- **Pixel units.** `highwayMaxDistance` (300) and `networkPopRadiusPx` (300) are canvas pixels, not km. Changing canvas size changes their meaning. `highwayMaxDistance: 120` produced almost no highways at the default canvas.
- **Threshold floor.** Zone connection thresholds must exceed the 90px minimum node separation or nodes can never connect organically and everything falls through to forced BFS edges.
- **networkFactor coupling.** The CityScreen Remote/Connected/Highly-connected cut points (1.0 / 1.55) are calibrated against the current scoring weights. Changing `networkScale`, the 15% second-order weight, or any `networkPop*` value invalidates them.

---

## Suggested next steps

1. **Answer the grid question** — readability or feel. Decides Option B vs C.
2. If proceeding: add terrain assignment to `buildCityNodes` and a tile layer to `NodeMap`, keeping the link topology untouched.
3. Remove `[MAP-VERIFY]` logs once generation stabilises.
4. Refresh [known-gaps.md](known-gaps.md), which still describes MVP 1.0.
