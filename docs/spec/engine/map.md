## map.ts

Single source of truth for spatial infrastructure. Map topology is **procedurally generated** from a seed plus a `MapConfig`. Nothing about the map is hardcoded.

---

### Generation pipeline

`newGame(playerName, mapConfig?)` draws a random `mapSeed` and calls:

```
buildCityNodes(mapSeed, mapConfig)   → Record<string, CityNode>
buildMapLinks(nodes, mapSeed, mapConfig) → Record<string, MapLink>
```

Both use `makeSeededRNG` (mulberry32). `buildCityNodes` and `buildMapLinks` each start a **fresh RNG from the same seed**, so `buildMapLinks` can replay Step 1 of `buildCityNodes` to reconstruct region centres and their zone characters. This replay is exact only if both call `drawZoneChar` the same number of times in the same order — if you add or remove an RNG draw in `buildCityNodes` Step 1, you must mirror it in `buildMapLinks`.

`[MAP-VERIFY]` console logs in both functions print centre zones and per-node zones so the replay can be checked. Centre zones match exactly; a handful of boundary nodes may differ because `buildMapLinks` assigns nodes to zones by Voronoi nearest-centre while `buildCityNodes` uses the exact `_centreIdx`. This divergence is accepted and only affects link thresholds at zone borders.

---

### buildCityNodes

1. **Region centres** — `clamp(round(nodeCount / 10), 4, 6)` centres, rejection-sampled to stay `canvasWidth × 0.25` apart (gap relaxes 20% every 50 failed attempts). Each centre draws a `ZoneChar`.
2. **Populations** — lognormal `μ=11.2, σ=0.85`, clamped to `[15_000, 950_000]` (median ≈ 73k). Sorted descending, then dealt to centres in zone-priority order `metropolitan > coastal > industrial > rural`, so metro regions receive the largest cities.
3. **Names** — 80-name pool, seeded Fisher-Yates shuffle, drawn without replacement.
4. **Placement** — Gaussian scatter `σ = canvasWidth / (regionCount × 2)` around the centre, rejection-sampled for a **90px minimum separation**, 60px canvas padding. After 50 failed attempts the node is pushed 95px radially away from its nearest neighbour.
5. **Ports** — `portCount` nodes promoted, preferring highest-population coastal-zone nodes, falling back to non-metropolitan nodes. Promoted nodes are moved into the `portEdgeMargin` band of the nearest canvas edge, get `type: "port"`, `harborAccess: true`, a fixed A1/B2/C3 store layout, and a `"Port "` name prefix.
6. **Derived economics** — `geoCeiling`, `baseGrowthRate`, `baseWealthRate` (see [city.md](city.md)).

**Node type**: every generated node is `"city"`, except ports which are `"port"`. `"town"` was removed from `NodeType`; `"airport"` remains reserved and unused.

**`factorySlots`** is derived from population only:

| Population | factorySlots |
|-----------|--------------|
| ≥ 300,000 | 6 |
| ≥ 150,000 | 4 |
| ≥ 60,000  | 3 |
| otherwise | 2 |

Ports use the same formula — there is no port-specific override.

---

### buildMapLinks

**Step 1 — Intra/cross-zone roads.** Every node pair within a distance threshold gets a road. Base threshold is the average of both endpoints' zone thresholds:

| ZoneChar | threshold (px) |
|----------|----------------|
| metropolitan | 200 |
| industrial | 160 |
| coastal | 140 |
| rural | 110 |

All thresholds sit above the 90px minimum node separation, so organic connections can actually form. The threshold is then multiplied by a `connectivity` factor — `intraZone` when both endpoints share a zone, `crossZone` otherwise:

| connectivity | intraZone | crossZone |
|-------------|-----------|-----------|
| isolated | 0.50 | 0.30 |
| sparse | 0.75 | 0.60 |
| normal | 1.00 | 1.00 |
| dense | 1.35 | 1.30 |

The separate `crossZone` factor is what makes regions feel distinct: `isolated` leaves zones nearly self-contained, `dense` integrates them.

**Step 2 — Highway MST.** Prim's minimum spanning tree over a candidate set determined by `infrastructure`:

| infrastructure | candidates | MST reach |
|---------------|-----------|-----------|
| undeveloped | none — no highways at all | — |
| basic | top `max(3, 8%)` of nodes by population | `highwayMaxDistance` |
| developed | population ≥ 80,000 | `highwayMaxDistance` |
| advanced | population ≥ 40,000 | `highwayMaxDistance × 1.3` |

Only edges within the effective reach are eligible. When no candidate is reachable the loop seeds a new sub-tree from the next unvisited candidate, so the highway network may be a forest rather than a single tree.

**Step 3 — Port hookup.** A port not already on a highway links to the nearest highway node within reach; if none is reachable it gets a plain road to the nearest non-port city.

**Step 4 — Minimum degree.** Every node with fewer than `minimumDegree` links gains roads to its nearest not-yet-connected neighbours. This is what removes dead-end settlements; it runs before the BFS fallback so the fallback rarely fires.

**Step 5 — Connectivity guarantee (BFS).** Flood-fill from node 0; any unreached node is force-linked to the nearest reached node and logs `Forced connectivity edge: …`. A high count here indicates thresholds are too tight for the node spacing.

**Step 6 — Distance.** `SCALE_FACTOR = 800 / hypot(canvasWidth, canvasHeight)` (≈0.328 at the default 2000×1400 canvas). Every link distance is `clamp(round(euclidean × SCALE_FACTOR), 20, 100)` km. The clamp is a hard game-balance rule: **no link is ever shorter than 20km or longer than 100km**, regardless of on-screen geometry.

---

### MapConfig

Defined in `types/index.ts`, defaults in `gameConfig.ts`.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `nodeCount` | number | 50 | total nodes |
| `portCount` | number | 3 | nodes promoted to ports |
| `mapType` | trading / industrial / frontier | trading | zone-character weights |
| `connectivity` | isolated / sparse / normal / dense | normal | road density, intra + cross zone |
| `minimumDegree` | 0–3 | 1 | guaranteed links per node |
| `infrastructure` | undeveloped / basic / developed / advanced | developed | highway candidate set + reach |
| `difficulty` | easy / medium / hard | medium | ±10 metropolitan vs rural zone weight |
| `canvasWidth` / `canvasHeight` | number | 2000 / 1400 | coordinate space; drives SCALE_FACTOR |
| `portEdgeMargin` | number | 120 | how close ports sit to a canvas edge |
| `highwayMaxDistance` | number | 300 | max px for an MST highway edge |

**Named presets** exported from `gameConfig.ts`: `defaultMapConfig`, `europeanMapConfig` (dense/2/advanced/easy), `developingMapConfig` (sparse/1/basic), `frontierMapConfig` (frontier/isolated/0/undeveloped/hard), `industrialMapConfig` (industrial/normal/1/developed).

> `highwayMaxDistance` is in **canvas pixels, not km**. It must scale with `canvasWidth`/`canvasHeight`. At 300px on the default canvas typical large-city spacing is ~240px, so the MST connects; an earlier value of 120px produced almost no highways.

---

### Zone characters

`ZoneChar = "metropolitan" | "industrial" | "rural" | "coastal"`. Weights by `mapType`:

| mapType | metro | industrial | rural | coastal |
|---------|-------|-----------|-------|---------|
| trading | 30 | 20 | 25 | 25 |
| industrial | 20 | 40 | 25 | 15 |
| frontier | 10 | 15 | 50 | 25 |

`difficulty` shifts ±10 between metropolitan and rural. Zone also sets the starting `wealthIndex` draw (metro `N(0.55, 0.10)` → rural `N(0.30, 0.10)`).

---

### Spatial queries

- `getConnectedNodes(state, nodeId)` — direct neighbours, undirected.
- `isHarborAccessible(state, nodeId)` — true if the node is a harbor/port or adjacent to one.
- `getHarborLinkDistance(state, fromNodeId)` — BFS **hop count** to the nearest harbor/port (0 if it is one). Not km.
- `getTransportCost(state, from, to)` — Dijkstra over `baseCost × (1 - linkCostReductionPerLevel × investmentLevel)`. Cost-weighted, ignores `distance`.

---

### Open questions

- Grid/tile map rendering — see [handoff.md](../handoff.md); roadmap already lists "full hex grid world map with ocean links between countries".
- Highway density is currently implicit in `infrastructure`; no direct "how many highways" knob.
- `getTransportCost` ignores `distance` and link capacity entirely.
- `"airport"` node type is declared but never generated.
