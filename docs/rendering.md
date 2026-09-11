# Rendering — NodeMap terrain layer

*Added 2026-09-11.*

## Why

`buildCityNodes` produces genuinely geographic positions, but `NodeMap` drew only circles
and lines on a flat background. The result read as an abstract graph rather than a map:
the empty space between region clusters looked like a rendering fault instead of sea or
countryside, the zone-character system was invisible despite driving wealth, population
and link thresholds, and link lengths had no frame of reference to be judged against.

The fix is deliberately the smallest one that addresses the visual complaint. Generation
is untouched. The layer reads `node.position` and `node.zone` and draws underneath
everything else.

## How

A Voronoi diagram (`d3-delaunay`) over the existing node positions, one cell per city,
memoised on `gameState.cityNodes` — positions never change after generation, so it is
computed once per game. It lives in its own `<g className="terrain">` as the **first
child** of the existing pan/zoom transform group, so it pans and zooms with the map and
sits below the links, contract lines and nodes. It is `pointerEvents="none"`, so it
cannot intercept clicks meant for a city.

Three sublayers, back to front:

1. **Sea** — one rect covering the land box plus `WATER_MARGIN` (340 units).
2. **Land** — one `<path>` per Voronoi cell, filled by `ZONE_FILL[node.zone]`.
3. **Coastline** — a stroked outline of the land box.

### Water is explicit, not emergent

A Voronoi has no concept of a coast. Clipping it to a box does not produce water; it just
produces cells with straight outer edges, and a port would get a landlocked cell like
everyone else. So the sea is its own rect, drawn behind, and the Voronoi is clipped to a
**smaller** box — the node bounding box plus `LAND_MARGIN` (55 units). The difference
between the two boxes is what shows as sea.

Generation moves ports into the `portEdgeMargin` band of the nearest **canvas** edge, and
that can be any of the four, so the coherent reading is an island with sea on all sides
rather than one coastline. Ports land in the coastal strip by construction.

### Cell strokes

Each cell is stroked in its own fill colour. That is not decoration — abutting SVG paths
show hairline antialiasing seams, and without the stroke a run of same-zone cells reads as
a per-city mosaic, which is exactly the diagram look the layer exists to remove. Zone
boundaries stay visible because the colour changes there; no separate boundary pass.

### Road colour

Roads were `#2a3347` (the `--border` token) at 1px — chosen against a near-black
background, and invisible over any land tone. They are now `--text-dim` (`#6b7a94`) at
0.75 opacity, which clears every `ZONE_FILL`. Highways (`#c87a1a`, 3px) needed no change.

## Palette

| Element | Colour | Note |
|---|---|---|
| metropolitan | `#272c3b` | slate violet — built-up |
| industrial | `#302a26` | warm brown-grey — works and yards |
| rural | `#232c22` | dark olive — farmland |
| coastal | `#1d2c30` | dark teal — estuary and dune |
| sea | `#0a1017` | a shade below `--bg`, so the coastline reads |
| coastline | `#33485e` | 1.5px, 70% opacity |
| road | `#6b7a94` | was `#2a3347` |

All four land tones are darker than the road colour and than every node fill, so cities and
roads keep their figure-ground separation.

## Constraints honoured

No RNG draws, no store changes, no link-topology changes from this layer, no change to
`map.ts` generation behaviour. The one edit to `map.ts` — writing `zone` onto the node —
was needed because the renderer could not otherwise reach it: `ZoneChar` was a private type,
the zone was stripped before return, and `mapSeed` is not persisted on `GameState`, so it
could not even be recomputed. See [spec/engine/map.md](spec/engine/map.md).

## Known limits

- The coastline is a rectangle. A hull or a noised edge would read better; deliberately out
  of scope for this change.
- Every node on the bounding box touches the sea, not only ports. Acceptable under the
  island reading, but it means "coastal" is partly a rendering accident at the edges.
- Cell area is a Voronoi artefact, not territory. A city in a sparse region gets a large
  cell because its neighbours are far away, not because it governs more land. Do not let
  gameplay start reading meaning into cell size without making that real first.
- Bundle cost: `d3-delaunay` + `delaunator` add ~19 kB raw, ~7 kB gzip.
