## city.ts

City life simulation: population growth, wealth drift, and the connectivity factor that couples a city to the road network. All tunables live in `GameConfig.cityLife`.

---

### Exports

| Function | Purpose |
|----------|---------|
| `getCityDemandMultiplier(state, cityId)` | `demandModifier × (0.5 + wealthIndex)` — 1.0 at defaults |
| `getWealthElasticityAdjustment(city)` | `1 - (wealthIndex - 0.5) × wealthElasticityFactor` — rich cities are less price-sensitive |
| `computeNetworkFactor(state, cityId)` | connectivity multiplier, also drives the CityScreen badge |
| `tickPopulation(state)` | logistic population growth, called each turn before retail |
| `tickWealth(state)` | per-city wealth drift |
| `getCityIndustrialBonus(...)` | returns 1.0 — placeholder |

`tickCities` no longer exists; it was split into `tickPopulation` and `tickWealth`.

---

### Population growth

Logistic growth toward `geoCeiling`, modulated by network connectivity:

```
dP = baseGrowthRate × pop × (1 - pop/geoCeiling) × networkFactor × timeScale
   - naturalDecayRate × pop × timeScale
   + N(0, populationNoiseStd × √timeScale) × pop

pop = max(100, round(pop + dP))
```

`geoCeiling` is drawn once at generation: `pop × sizeFactor × territoryFactor`, where `sizeFactor = clamp(8.0 - log10(pop) × 1.4, 1.05, 3.5)` and `territoryFactor ~ lognormal(0.75, 0.25)`. Small towns get proportionally more headroom than large cities, so a 15k village can plausibly triple while a 900k metropolis is near saturation.

`naturalDecayRate` (0.003) is subtracted unconditionally, so a city whose growth term falls below it **shrinks**. A remote city (`networkFactor` ≈ 0.5) with a low `baseGrowthRate` will decline — this is intended.

### Wealth drift

```
wd = baseWealthRate × timeScale + N(0, wealthNoiseStd × √timeScale)
wealthIndex = clamp(wealthIndex + wd, cities.wealthMin, cities.wealthMax)
```

`baseWealthRateMean` is **negative** (-0.000450): the default trajectory is slow impoverishment, and `baseWealthRateStd` (0.000300) decides which cities buck it. Roughly the top third of the draw is above zero, so a minority of cities prosper while most erode. Both are per-city constants drawn at generation, never updated.

Starting `wealthIndex` comes from the node's zone character, not its type — see [map.md](map.md).

---

### networkFactor

```
clamp(networkBase + score, networkMin, networkMax)
```

`score` sums three independent components:

**1. Direct road topology.** For each link on the city, if `distance < networkMaxDistance`:
`score += (1 - distance/networkMaxDistance) × networkScale`

**2. Second-order topology.** For each neighbour-of-neighbour link (excluding links back to this city), the same term at **15% weight**. Second-order weight is deliberately low: at 30% even a one-link village scored above the "Connected" threshold.

**3. Population gravity.** For every other city within `networkPopRadiusPx` **canvas pixels** (not km):
`score += (population / networkPopNorm) × (1 - distPx/radius) × networkPopScale`

Component 3 is what distinguishes a genuinely isolated settlement from one that merely has few roads but sits beside a metropolis. Without it, a village 10km from a major city read as "Remote" purely because it had one road.

**Config** (`GameConfig.cityLife`): `networkBase 0.5`, `networkScale 0.3`, `networkMaxDistance 500`, `networkMin 0.3`, `networkMax 2.0`, `networkPopRadiusPx 300`, `networkPopNorm 200_000`, `networkPopScale 0.05`.

**CityScreen thresholds**: `< 1.0` Remote · `< 1.55` Connected · else Highly connected. These are calibrated against the score distribution, not chosen abstractly — at seed 42 / 50 nodes the split is roughly 20 Remote (0.81–0.97), 28 Connected (1.09–1.54), 2 Highly connected (1.60–1.66).

> `networkPopRadiusPx` is in canvas pixels, so it is coupled to `canvasWidth`/`canvasHeight`. Changing canvas size silently changes what counts as "nearby". Re-tune together with the CityScreen thresholds.

---

### Retuning procedure

`computeNetworkFactor` is pure and reads only `state.cityNodes` / `state.mapLinks`, so it can be scored offline against a generated map without running a game. Print the sorted distribution across all nodes, then set the CityScreen cut points at the visible gaps. Changing `networkScale`, the 15% second-order weight, or any `networkPop*` value **invalidates the CityScreen thresholds** — they must be re-derived together.

---

### Open questions

- Player firms do not yet influence city wealth or industrial identity.
- No city events (factory closure, population boom, industrial decline).
- No employment model; firm count does not affect growth.
- `getCityIndustrialBonus` is a stub returning 1.0 — cluster bonuses unimplemented.
- Port-proximity wealth bonus and network wealth spillover both unimplemented.
- Land value is a hardcoded placeholder (`1`) in CityScreen.
