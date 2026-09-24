# World Builder

**https://world.supply-chain-sim.lucasjohnston.nl** — added 2026-09-24.

An interactive tuning tool for world generation. Change a parameter, see the world
redraw, step it forward, and export the exact settings as JSON.

## Why it is in this repo

It is a separate site, but **not** a separate project. The whole point of the tool is
the round trip: tune a world here, export the parameters, apply them to the game, get
the same world. That only holds if both run the same generator. A separate repo with a
copied `map.ts` would drift within weeks, and then you would be tuning a world the game
cannot reproduce.

So: one codebase, two Vite entry points.

| | |
|---|---|
| `index.html` → `src/main.tsx` | the game |
| `world.html` → `src/world/main.tsx` | the world builder |

`npm run build` (or `npx vite build`) emits both into `dist/`. Rollup hoists the shared
engine into a common chunk, so the builder loads ~258 kB against the game's ~760 kB.
Nginx serves the same `dist/` on two server names; only the index file differs.

## What it does

- **Generate** from a seed plus every parameter, player-visible and hidden.
- **Regenerate** on any change (toggleable) — generation is sub-millisecond at 50 nodes.
- **Step** the world forward 1, 10 or 50 turns of city life, or reset to step 0.
- **Inspect** — hover a city for population, ceiling, wealth, growth rate, road count.
- **Measure** — a statistics bar that answers "is this world sane", with warnings on the
  numbers that usually indicate trouble.
- **Export / import** the full spec as JSON.

## The three layers of parameter

**Player-visible** — exactly what the game's `StartScreen` offers: `nodeCount`,
`portCount`, `mapType`, `connectivity`, `minimumDegree`, `infrastructure`, `difficulty`.

**Hidden but already in `MapConfig`** — `canvasWidth`, `canvasHeight`, `portEdgeMargin`,
`highwayMaxDistance`. Present in the type, never exposed in the game UI.

**Hidden and formerly hard-coded** — the interesting ones. Population distribution,
region count and separation, scatter tightness, minimum city separation, zone weights,
zone connection thresholds, connectivity factors, highway eligibility, geoCeiling shape,
and world scale. These lived as literals inside `map.ts`; they now live in
[`src/config/worldParams.ts`](../src/config/worldParams.ts) as `WorldParams`.

> **The defaults in `worldParams.ts` are the former literals, value for value.** That was
> verified by hashing the full generated world — positions to nine decimals, populations,
> zones, wealth, ceilings, growth rates and the complete link set — across four presets
> and five seeds before and after the change. All twenty hashes matched. If you edit a
> default, re-run that check; the builder is only trustworthy while it stays true.

## Statistics worth watching

Most are self-explanatory. Three are worth calling out, because they diagnose the
complaints that prompted this tool:

- **Forced edges** — BFS fallback links added because a city could not reach the network
  organically. At the default config this sits at 9–11 on a 50-node map, about one city
  in five. High values mean the zone thresholds are tight relative to the city spacing,
  and they are the likeliest cause of the "clusters with dead space between them" look.
- **On the clamp** — links pinned to the length floor or ceiling. Every link is clamped to
  `[linkDistanceMinKm, linkDistanceMaxKm]`. When most links sit on a bound, the clamp
  rather than the geometry is deciding your distances, and changing the world scale will
  do nothing you can see.
- **World size** — set by `worldDiagonalKm`, **not** by the canvas. `SCALE_FACTOR =
  worldDiagonalKm / hypot(canvasW, canvasH)`, so the canvas only changes pixel density.
  At the default 800 the world is 655 × 459 km ≈ 301,000 km² — roughly Italy. The
  Netherlands is ~300 km corner to corner; at that setting the 20 km link floor becomes
  the binding constraint on density, which is exactly what the clamp stat will show you.

## Determinism

Generation is seeded and reproducible. Stepping is not, in the game: `tickPopulation` and
`tickWealth` draw from `Math.random`. For a tuning tool that is useless — you could not
separate a parameter's effect from noise.

`worldModel.ts` therefore swaps in a seeded generator for the duration of each step and
restores it in a `finally`. The step seed is derived from the world seed and the step
index, so `(seed, step)` always yields the same world whether you got there in one jump
of 50 or fifty of 1. Verified: stepping to 61, resetting, and stepping to 61 again gives
an identical population to the unit.

This is a wrapper, not an engine change. The engine keeps running exactly the code the
game runs; determinism stays a property of the tool.

## Export format

```json
{ "formatVersion": 1, "seed": 2651820934, "map": { … }, "world": { … } }
```

`map` is a full `MapConfig`, `world` a full `WorldParams`. Import merges over the current
defaults, so an export missing a field added since still loads.

To apply a tuned world to the game: paste `world` over `defaultWorldParams` in
`src/config/worldParams.ts` and `map` over `defaultMapConfig` in `gameConfig.ts`.

## Known limits

- Stepping runs city life only — population and wealth. Not the full `tick.ts`, which
  needs corporations and firms. That is the right scope for a *world* builder, but it
  means you are not seeing how the economy reshapes cities over 200 turns.
- No touch support on the map; wheel and drag only.
- Zone weights and connectivity factors are edited for the *currently selected* map type
  and connectivity setting. The other entries are still exported, just not shown.
