# Handoff — current state and open threads

*Last updated: 2026-09-11*

Read this first when picking up work. [known-gaps.md](known-gaps.md) describes the MVP 1.0 era and is **not** current.

---

## Remote and deployment

`https://github.com/lrjohnst/supply-chain-sim` — pushed 2026-09-10, `main` tracks `origin/main`.

The game is live at **https://supply-chain-sim.lucasjohnston.nl**, served as a static Vite build
behind Nginx on srv6. No backend — it is entirely client-side. See [../deployment.md](../deployment.md)
for the rebuild procedure and why it runs `npx vite build` rather than `npm run build`.

**Note:** `tsc -b` currently fails with 31 errors on `main`, so `npm run build` does not complete.
`ReadmeClaude.md` asks for a clean typecheck before committing; that is not the case at `acf2df3`.
Logged as item 1 in [../../BACKLOG.md](../../BACKLOG.md).

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

- ~~**RNG replay coupling.**~~ **Gone as of 2026-09-11.** `buildMapLinks` no longer replays `buildCityNodes` Step 1 — the zone is carried on `CityNode.zone` and read directly. `buildMapLinks` takes no seed and draws no RNG. The `[MAP-VERIFY]` logs are removed. You can now add or reorder RNG draws in Step 1 freely.
- **Pixel units.** `highwayMaxDistance` (300) and `networkPopRadiusPx` (300) are canvas pixels, not km. Changing canvas size changes their meaning. `highwayMaxDistance: 120` produced almost no highways at the default canvas.
- **Threshold floor.** Zone connection thresholds must exceed the 90px minimum node separation or nodes can never connect organically and everything falls through to forced BFS edges.
- **networkFactor coupling.** The CityScreen Remote/Connected/Highly-connected cut points (1.0 / 1.55) are calibrated against the current scoring weights. Changing `networkScale`, the 15% second-order weight, or any `networkPop*` value invalidates them.

---

## What was done instead, 2026-09-11

Rather than decide the grid question, a **Voronoi terrain layer** was added to `NodeMap` —
land tinted by zone character, explicit sea, coastline, ports reading as coastal. It gives
the map a body without touching generation, and it makes the existing zone system visible
for the first time. See [../rendering.md](../rendering.md).

This does not answer the grid question; it buys time to answer it against a map that has a
body. Re-evaluate B vs C now that the terrain exists — it is possible neither is needed.

## Suggested next steps

1. **Look at the map again** with terrain on, then answer the grid question — readability or
   feel — if it still matters.
2. **Forced-connectivity edges run high**: 9–11 per 50-node map across five seeds, i.e. about
   one node in five cannot reach the graph organically. `map.md` Step 5 says that means
   thresholds are tight for the node spacing. This is a plausible root cause of the
   "clusters with dead space between them" complaint, and it is a generation question, not a
   rendering one.
3. **World scale is not expressible.** `SCALE_FACTOR = 800 / hypot(canvasWidth, canvasHeight)`
   — the 800 is a literal, so canvas size changes pixel density but never the world's size in
   km. It is always 800 km on the diagonal, ≈301,000 km² at the default aspect. Making this a
   `MapConfig` field is a prerequisite for any tile map, because a tile needs a size in km.
4. Refresh [known-gaps.md](known-gaps.md), which still describes MVP 1.0.
