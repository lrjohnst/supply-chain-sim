"""
City Growth Simulation v7
=========================
A calibration sandbox for the city-life system that will be implemented
in city.ts. Run this script to verify that population curves, wealth
dynamics, and location unlock timing feel right before baking numbers
into the game engine.

Changes from v5:
  - NETWORK_FACTOR removed from K; now multiplies dP directly
    (connectedness affects growth speed, not carrying capacity)
  - Geographic ceiling territory draw shifted via TERRITORY_MU so the
    drawn ceiling is guaranteed to land above startPop / BASE_CAPACITY_FRACTION
  - BASE_CAPACITY_FRACTION raised from 0.40 to 0.65

Run with:
    python city_growth_v7.py

Outputs:
    city_growth_v7.png    population + wealthIndex per scenario
    land_value_v7.png     landValue + wealthIndex per scenario
    printed tables        one per scenario + a final summary
"""

import random
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker


# =============================================================================
# PARAMETERS
# All tunable numbers live here. Formulas below contain no magic numbers.
# Convention for comments: ↑ = increase, ↓ = decrease.
# =============================================================================


# --- Simulation length -------------------------------------------------------

TURNS = 200 # total simulation steps (one step = one quarter in-game)


# --- Population growth -------------------------------------------------------
# baseGrowthRate is drawn once per city at game start from a normal distribution,
# then clamped to [MIN, MAX]. Cities draw different rates, making some naturally
# faster-growing than others even before employment or investment.

BASE_GROWTH_RATE_MEAN = 0.008 # centre of the distribution; ↑ = all cities grow faster on average
BASE_GROWTH_RATE_STD  = 0.003 # spread of the distribution; ↑ = more variation between cities
BASE_GROWTH_RATE_MIN  = 0.002 # floor after clamping; prevents cities from being fully stagnant
BASE_GROWTH_RATE_MAX  = 0.015 # ceiling after clamping; prevents unrealistic boom cities

NOISE_STD = 0.008 # std of per-turn Gaussian noise applied to population delta
                  # ↑ = more quarter-to-quarter volatility; should stay small relative
                  # to the growth signal so it stays incidental, not structural

NATURAL_DECAY_RATE = 0.0004 # small per-turn proportional population loss regardless of employment
                             # represents emigration, ageing, structural demographic drift
                             # applied as: -NATURAL_DECAY_RATE × pop every turn
                             # at 0.0003: a 30k city loses ~9 people/turn = ~1,800 over 200 turns = -6%
                             # this is what makes an ignored city slowly fade even with positive K
                             # ↑ = all cities decay faster without investment; baseline neglect hurts more
                             # ↓ = cities are stickier; natural demographics are more neutral


# --- Employment effect on growth ---------------------------------------------
# employmentMult scales the population growth rate based on how many employees
# work in the city relative to its population. No firms → city barely grows.
# Many firms relative to population → city grows at full rate.

EMPLOYMENT_RATIO_SCALE = 1200 # converts employeeRatio to growth multiplier headroom
                              # formula: MIN + ratio × SCALE, capped at EMPLOYMENT_MULT_MAX
                              # at 1200: 110 employees in 250k city → em ≈ 0.58 (meaningful)
                              #          40 employees in 50k city  → em ≈ 1.01 (strong)
                              #          70 employees in 120k city → em ≈ 0.75 (moderate)
                              # ↑ = a given number of employees has more impact on growth
                              # ↓ = employment matters less; cities grow more on their own
EMPLOYMENT_MULT_MIN    = 0.05 # floor: city with zero firms has minimal residual activity
                              # lowered from 0.1 so ignored cities genuinely stagnate
                              # ↑ = no-firm cities grow faster (less punishment for ignoring)
                              # ↓ = ignored cities stagnate harder
EMPLOYMENT_MULT_MAX    = 1.5  # ceiling: even a city saturated with firms has a growth cap
                              # ↑ = heavy investment pays off more in population terms
                              # ↓ = diminishing returns kick in sooner


# --- Carrying capacity K -----------------------------------------------------
# K is the population level at which growth stalls. Above K, growth turns negative.
# K has two components: a geographic ceiling (hard, fixed per city) and an economic
# capacity (soft, rises with employment). K = min(geo, economic).

BASE_CAPACITY_FRACTION = 0.62 # economic base capacity = geo ceiling × this fraction, with no firms
                              # at 0.62 with absolute EMPLOYMENT_K_FACTOR: most invested cities
                              # have K above startPop; no-firm cities have K below startPop
                              # ↑ = no-firm cities can sustain more people before stalling
                              # ↓ = cities without investment decline earlier and faster

EMPLOYMENT_K_FACTOR    = 800  # residents sustainably supported per employee (absolute count)
                              # each employee lifts K by this many people
                              # 40 employees in 50k city  → K lift of  24,000
                              # 110 employees in 250k city → K lift of 66,000
                              # 90 employees in 280k city  → K lift of 54,000
                              # ↑ = each employee sustains more population; firms matter more
                              # ↓ = firms matter less; population depends more on geo ceiling

# Geographic ceiling: computed dynamically per city from startPop × sizeFactor × territoryFactor.
# sizeFactor: larger cities have less relative headroom (they are already mature).
# territoryFactor: random per city, representing available land.

SIZE_FACTOR_BASE  = 8.0  # intercept of the headroom curve
                         # at 8.0 with slope 1.4: 30k → sf≈1.54, 120k → sf≈1.26, 300k → sf≈1.11
                         # ↑ = all cities get more headroom; S-curve appears later
SIZE_FACTOR_SLOPE = 1.4  # how fast headroom shrinks as log10(startPop) grows
                         # raised to 1.4 so large cities get meaningfully less headroom
SIZE_FACTOR_MIN   = 1.05 # floor: even the largest city retains some growth potential
SIZE_FACTOR_MAX   = 3.5  # ceiling: smallest settlements have a natural limit

TERRITORY_MU    = 0.15 # lowered from 0.5; median territory factor now exp(0.15)≈1.16
                       # gives modest headroom above startPop × sizeFactor
                       # some cities will draw below 1.0 (tight territory), which is intentional
                       # ↑ = more geographic headroom on average; S-curve appears later
                       # ↓ = tighter ceilings; logistic brake fires earlier and harder
TERRITORY_SIGMA = 0.25 # tightened from 0.30 to reduce lucky high draws distorting scenarios
                       # ↑ = wider spread; more Nijmegen/Ede extremes
                       # ↓ = most cities converge toward the sizeFactor baseline


# --- Wealth index ------------------------------------------------------------
# wealthIndex is a value in [0.05, WEALTH_INDEX_CEILING] representing how affluent
# a city is. It evolves via a logistic S-curve: slow growth at low wealth, fastest
# growth in the middle, flattening near the ceiling. A constant decay term drains it
# every turn regardless of employment.

WEALTH_GROWTH_RATE   = 0.015 # rate constant for the logistic S-curve
                             # ↑ = wealth rises faster when conditions are good
                             # ↓ = wealth accumulation is slower; cities feel poorer longer
WEALTH_DECAY_RATE    = 0.0008 # fixed per-turn drain on wealthIndex
                              # ↑ = cities decay faster without active investment
                              # ↓ = wealth is stickier; past prosperity lingers longer
WEALTH_INDEX_FLOOR   = 0.05  # hard lower bound on wealthIndex
WEALTH_INDEX_CEILING = 0.95  # upper asymptote of the logistic curve; wealth approaches
                             # but never reaches this value
                             # ↑ = wealthier possible endstate; adjust carefully


# --- Recession ---------------------------------------------------------------
# Recession modifies population growth directly (multiplied into dP) and also
# damages wealthIndex additively each turn it is active.

RECESSION_MOD_MILD         = 0.70  # population growth multiplier during mild recession
                                   # 1.0 = no effect, 0.0 = growth halted, <0 = shrinks
RECESSION_MOD_SEVERE       = -0.80 # raised from -0.30; strong negative causes real population
                                   # drop in S7, not just a slowdown
RECESSION_SEVERITY_MILD    = 0.3   # used to scale RECESSION_WEALTH_DAMAGE for mild recessions
RECESSION_SEVERITY_SEVERE  = 0.8   # used to scale RECESSION_WEALTH_DAMAGE for severe recessions
RECESSION_WEALTH_DAMAGE    = 0.025 # raised from 0.010; severe recession now leaves a visible
                                   # wealth dip that recovers slowly over many turns
                                   # ↑ = recessions hit wealth harder and leave longer scars
                                   # ↓ = wealth recovers quickly once recession ends


# --- Network effect ----------------------------------------------------------
# Neighboring cities contribute a small wealth boost proportional to their own
# wealthIndex, weighted by their population. Isolated cities get nothing.
# The result: small cities next to wealthy large cities get a disproportionate lift.

NETWORK_WEALTH_FACTOR = 0.004 # per-turn wealth boost per unit of population-weighted neighbour wealth
                              # ↑ = network effects are stronger; suburban spillover is more visible
                              # ↓ = cities are more economically isolated from each other
NETWORK_ISOLATED      = 0.5  # growth speed multiplier for cities with no neighbours
                             # lowered to 0.5 so isolated no-firm cities decay at -5 to -10%
                             # ↑ = isolation penalty on growth speed is smaller
                             # ↓ = isolated cities grow noticeably slower
NETWORK_CONNECTED     = 1.2  # growth speed multiplier for well-connected cities
                             # ↑ = connectivity pays off more in growth speed
                             # ↓ = connectivity matters less for how fast the city grows
                             # note: network factor no longer affects K or carrying capacity


# --- Location unlocks --------------------------------------------------------
# As a city grows, new store locations become available. Two independent pressure
# accumulators drive this: growthPressure (from population delta) and wealthPressure
# (from positive wealth delta). growthPressure determines location size; wealthPressure
# determines location class.

BASE_UNLOCK_THRESHOLD          = 300  # growthPressure needed for the first unlock
                                      # ↑ = player waits longer for first location
                                      # ↓ = first location appears very early
UNLOCK_THRESHOLD_MULTIPLIER    = 1.2  # each subsequent unlock costs this much more pressure
                                      # ↑ = later unlocks are increasingly rare
                                      # ↓ = unlocks keep coming at a steady pace
GROWTH_PRESSURE_RESET_FRACTION = 0.4  # fraction of growthPressure retained after an unlock
                                      # ↑ = next unlock comes sooner after each one (momentum)
                                      # ↓ = each unlock resets progress more severely


# --- Land value and build costs ----------------------------------------------
# landValue is a derived property: it rises with both population and wealth.
# Build costs scale with land value, making A-large locations in wealthy cities
# expensive early game and increasingly so as the city grows.

BASE_LAND_VALUE = 40_000 # land value at 100k population and wealthIndex=0 (roughly)
                         # ↑ = all build costs scale up across the board
                         # ↓ = building is cheaper everywhere


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def clamp(v, lo, hi):
    """Return v clamped to the range [lo, hi]."""
    return max(lo, min(hi, v))


def draw_growth_rate(seed=None, fixed=None):
    """
    Draw a base growth rate for a city at game start.

    If fixed is provided, return it directly (allows negative values for
    structural-decline scenarios without clamping). If seed is provided,
    draw from the normal distribution defined by BASE_GROWTH_RATE_* constants.
    """
    if fixed is not None:
        return fixed
    rng = random.Random(seed)
    return clamp(
        rng.gauss(BASE_GROWTH_RATE_MEAN, BASE_GROWTH_RATE_STD),
        BASE_GROWTH_RATE_MIN,
        BASE_GROWTH_RATE_MAX,
    )


def geographic_ceiling(start_pop, territory_seed):
    """
    Compute a city's geographic ceiling — the hard population cap set by its
    physical geography and municipal boundaries.

    Two factors:
      sizeFactor     — derived from startPop; larger cities have less headroom
                       because they are already mature relative to their region
      territoryFactor — drawn from a shifted lognormal distribution; represents
                        how much land the city actually has available to build on

    geoCeiling = startPop × sizeFactor × territoryFactor

    The lognormal draw is shifted by TERRITORY_MU so that the resulting
    geo ceiling is reliably above startPop / BASE_CAPACITY_FRACTION. This
    ensures the city does not start above its carrying capacity K at turn 0.

    Examples at current settings (30k–300k range):
      30k  city: sizeFactor ≈ 3.07
      120k city: sizeFactor ≈ 2.52
      300k city: sizeFactor ≈ 1.96

    A low territory draw models a city like Nijmegen: large but hemmed in.
    A high territory draw models a city like Ede: smaller but with vast land.
    """
    size_factor = clamp(
        SIZE_FACTOR_BASE - math.log10(start_pop) * SIZE_FACTOR_SLOPE,
        SIZE_FACTOR_MIN,
        SIZE_FACTOR_MAX,
    )
    rng = random.Random(territory_seed)
    territory_factor = math.exp(rng.gauss(TERRITORY_MU, TERRITORY_SIGMA))
    return round(start_pop * size_factor * territory_factor)


def employment_mult(employees, population):
    """
    Translate the ratio of employees to population into a growth rate multiplier.

    With no employees the multiplier sits at EMPLOYMENT_MULT_MIN (0.1), meaning
    the city grows at 10% of its base rate. The multiplier rises linearly with
    the employee-to-population ratio, scaled by EMPLOYMENT_RATIO_SCALE, and is
    capped at EMPLOYMENT_MULT_MAX (1.5).

    This is the primary lever the player has over a city's growth speed.
    """
    ratio = employees / max(population, 1)
    return clamp(
        EMPLOYMENT_MULT_MIN + ratio * EMPLOYMENT_RATIO_SCALE,
        EMPLOYMENT_MULT_MIN,
        EMPLOYMENT_MULT_MAX,
    )


def economic_capacity(geo_ceiling, employees, population):
    """
    Compute the economic component of carrying capacity K.

    With no firms, base capacity is BASE_CAPACITY_FRACTION of the geographic
    ceiling. Employment lifts this by a fixed amount per employee: each employee
    sustainably supports EMPLOYMENT_K_FACTOR additional residents. This makes
    the lift independent of city size, so 110 employees in a large city has the
    same absolute K contribution as 110 employees in a small city.

    K is capped at geo_ceiling: no investment can override physical geography.
    """
    base = geo_ceiling * BASE_CAPACITY_FRACTION
    return min(geo_ceiling, base + employees * EMPLOYMENT_K_FACTOR)


def carrying_capacity(geo_ceiling, employees, population):
    """
    Compute the effective carrying capacity K for this turn.

    K = min(geoCeiling, economicCapacity)

    Network factor is no longer applied here. It has moved into dP directly,
    so that connectedness affects how fast the city grows, not how large
    it can ultimately become.
    """
    econ = economic_capacity(geo_ceiling, employees, population)
    return min(geo_ceiling, econ)


def land_value(population, wealth_index):
    """
    Derive land value from population and wealthIndex.

    Both factors compound: a large wealthy city has much higher land values
    than either a large poor city or a small wealthy one. This makes A-large
    locations in developed cities genuinely expensive and creates a meaningful
    early-vs-late-game cost difference.
    """
    pop_factor    = population / 100_000
    wealth_factor = 1 + wealth_index * 2.5
    return BASE_LAND_VALUE * pop_factor * wealth_factor


def build_costs(lv):
    """
    Derive the three build cost tiers from land value.

    These are the effective costs a player sees when opening a location.
    All three scale with land value, but at different rates — A-large
    locations are the most land-value-sensitive, C-small the least.
    """
    a_large  = 130_000 * (1 + lv / 150_000)
    b_medium =  65_000 * (1 + lv / 250_000)
    c_small  =  25_000 * (1 + lv / 400_000)
    return a_large, b_medium, c_small


def unlock_size(growth_pressure):
    """
    Determine the size (small/medium/large) of a newly unlocked location.

    Higher growthPressure at the moment of unlock shifts probability toward
    larger locations. This rewards patient accumulation of pressure rather
    than immediate investment as soon as the threshold is hit.
    """
    if growth_pressure > 3000:
        probs = [0.15, 0.35, 0.50]
    elif growth_pressure > 1500:
        probs = [0.30, 0.45, 0.25]
    else:
        probs = [0.60, 0.30, 0.10]
    r = random.random()
    if r < probs[0]:               return "small"
    elif r < probs[0] + probs[1]:  return "medium"
    return "large"


def unlock_class(wealth_pressure):
    """
    Determine the class (A/B/C) of a newly unlocked location.

    Higher wealthPressure at unlock shifts probability toward class A.
    Class is independent of size — a small-A location in a wealthy city
    is possible, as is a large-C location in a poor but growing one.
    """
    if wealth_pressure > 50:
        probs = [0.50, 0.35, 0.15]
    elif wealth_pressure > 20:
        probs = [0.25, 0.50, 0.25]
    else:
        probs = [0.10, 0.35, 0.55]
    r = random.random()
    if r < probs[0]:               return "A"
    elif r < probs[0] + probs[1]:  return "B"
    return "C"


# =============================================================================
# CORE SIMULATION
# =============================================================================


def simulate_city(
    pop0,
    territory_seed,
    network_factor,
    base_growth_rate,
    employees_schedule,
    recession_schedule,
    wealth0=None,
    noise_seed=42,
    wealth_noise_seed=99,
    neighbor_fn=None,
    geo_ceiling_override=None,
):
    """
    Simulate one city for TURNS steps and return its full time-series history.

    Arguments:
        pop0                 starting population
        territory_seed       integer seed for this city's territory draw
        network_factor       NETWORK_ISOLATED or NETWORK_CONNECTED
                             now multiplies dP (growth speed), not K
        base_growth_rate     intrinsic growth rate, drawn or fixed per scenario
        employees_schedule   {turn: employee_count} — step function for staffing
        recession_schedule   {turn: modifier} — 1.0 ends a recession
        wealth0              starting wealthIndex; randomly seeded if None
        noise_seed           seed for population noise RNG
        wealth_noise_seed    seed for wealth noise RNG (separate for reproducibility)
        neighbor_fn          callable(turn) -> [(population, wealthIndex), ...]
                             provides live neighbour data for network wealth effect
        geo_ceiling_override if set, bypasses the territory draw and uses this value
                             directly; useful when a specific ceiling is needed
    """
    rng  = random.Random(noise_seed)
    wrng = random.Random(wealth_noise_seed)

    if wealth0 is None:
        wealth0 = clamp(wrng.gauss(0.35, 0.12), 0.15, 0.65)

    geo_ceil = geo_ceiling_override if geo_ceiling_override is not None \
               else geographic_ceiling(pop0, territory_seed)
    pop           = float(pop0)
    wealth        = float(wealth0)
    g_pressure    = 0.0
    w_pressure    = 0.0
    unlock_thresh = BASE_UNLOCK_THRESHOLD
    employees     = 0

    emp_events = sorted(employees_schedule.items())
    rec_events = sorted(recession_schedule.items())

    history = {
        "population":     [],
        "wealth_index":   [],
        "growth_pressure": [],
        "wealth_pressure": [],
        "land_value":     [],
        "a_large_cost":   [],
        "b_medium_cost":  [],
        "c_small_cost":   [],
        "K":              [],
        "geo_ceil":       geo_ceil,
        "wealth0":        wealth0,
        "unlock_turns":   [],
        "unlock_details": [],
    }

    for t in range(TURNS + 1):

        # Step employee count forward from schedule
        for (et, ec) in emp_events:
            if t >= et:
                employees = ec

        # Resolve recession state for this turn
        rec_mod            = 1.0
        recession_severity = 0.0
        for (et, mod) in rec_events:
            if t >= et:
                rec_mod = mod
                if mod == RECESSION_MOD_MILD:
                    recession_severity = RECESSION_SEVERITY_MILD
                elif mod == RECESSION_MOD_SEVERE:
                    recession_severity = RECESSION_SEVERITY_SEVERE
                elif mod == 1.0:
                    recession_severity = 0.0

        # Carrying capacity for this turn (network_factor no longer applied here)
        K  = carrying_capacity(geo_ceil, employees, pop)
        em = employment_mult(employees, pop)

        # Population delta: logistic growth scaled by employment, network speed,
        # and recession. Network factor now multiplies dP directly rather than K.
        # Noise is a small fraction of current population — incidental, not structural.
        #
        # For structural decline (negative base_growth_rate), the logistic term
        # misbehaves: a negative rate × negative brake (pop > K) produces positive dP.
        # To fix this, negative growth rates bypass the logistic brake entirely and
        # apply as a direct proportional decline — the city shrinks regardless of K.
        noise = rng.gauss(0, NOISE_STD) * pop * 0.01
        if base_growth_rate < 0:
            dP = base_growth_rate * pop * em * network_factor * rec_mod + noise
        else:
            dP = base_growth_rate * pop * (1 - pop / K) * em * network_factor * rec_mod + noise
        # Natural decay: small demographic drift representing emigration and ageing.
        # Scales down with employment: a city with active firms retains people better.
        # em=0.05 (no firms): full decay. em=1.0 (well-staffed): 5% of decay applies.
        dP -= NATURAL_DECAY_RATE * pop * (1 - 0.95 * min(em, 1.0))
        pop = max(100, pop + dP)

        # Wealth delta: logistic S-curve, modified by employment, recession, and neighbours.
        # Logistic term: slow at low wealth, fastest at mid-wealth, flattens near CEILING.
        # Decay term: always draining, regardless of employment.
        neighbor_boost = 0.0
        if neighbor_fn is not None:
            neighbors       = neighbor_fn(t)
            total_nbr_pop   = sum(n[0] for n in neighbors)
            if total_nbr_pop > 0:
                weighted_wi    = sum(n[1] * n[0] for n in neighbors) / total_nbr_pop
                neighbor_boost = weighted_wi * NETWORK_WEALTH_FACTOR

        wealth_noise  = wrng.gauss(0, NOISE_STD * 0.1)
        wealth_delta  = (
            WEALTH_GROWTH_RATE * em * wealth * (1 - wealth / WEALTH_INDEX_CEILING)
            - WEALTH_DECAY_RATE
            + wealth_noise
            + neighbor_boost
            - recession_severity * RECESSION_WEALTH_DAMAGE
        )
        wealth = clamp(wealth + wealth_delta, WEALTH_INDEX_FLOOR, WEALTH_INDEX_CEILING)

        # Accumulate growth and wealth pressure
        g_pressure += max(0, dP)
        w_pressure += max(0, wealth_delta)

        # Trigger location unlock if threshold is reached
        if g_pressure >= unlock_thresh:
            sz  = unlock_size(g_pressure)
            cls = unlock_class(w_pressure)
            history["unlock_turns"].append(t)
            history["unlock_details"].append((t, sz, cls))
            g_pressure    *= GROWTH_PRESSURE_RESET_FRACTION
            unlock_thresh *= UNLOCK_THRESHOLD_MULTIPLIER

        lv          = land_value(pop, wealth)
        al, bm, cs  = build_costs(lv)

        history["population"].append(pop)
        history["wealth_index"].append(wealth)
        history["growth_pressure"].append(g_pressure)
        history["wealth_pressure"].append(w_pressure)
        history["land_value"].append(lv)
        history["a_large_cost"].append(al)
        history["b_medium_cost"].append(bm)
        history["c_small_cost"].append(cs)
        history["K"].append(K)

    return history


# =============================================================================
# SCENARIOS
# =============================================================================


def build_scenarios():
    """
    Define all 10 scenarios. Each is a (label, kwargs-dict) pair.
    Scenario 10 is a placeholder — it is built dynamically in __main__
    once scenario 5 (City A) has been simulated.
    """
    s = []

    s.append(("1. Small city\n(no firms, random seed)", dict(
        pop0=30_000, territory_seed=101,
        network_factor=NETWORK_ISOLATED,
        base_growth_rate=draw_growth_rate(seed=7),
        employees_schedule={}, recession_schedule={},
        noise_seed=1, wealth_noise_seed=11,
        geo_ceiling_override=38_000,  # K_base=23.6k < 30k; with nf=0.5 → decay -5 to -10% ✓
    )))

    s.append(("2. Small city\n(structural decline)", dict(
        pop0=30_000, territory_seed=202,
        network_factor=NETWORK_ISOLATED,
        base_growth_rate=-0.040,  # bypasses logistic brake; -0.040 → ~-24% over 200 turns
        employees_schedule={}, recession_schedule={},
        noise_seed=2, wealth_noise_seed=22,
    )))

    s.append(("3. Large city\n(no firms, natural momentum)", dict(
        pop0=300_000, territory_seed=303,
        network_factor=NETWORK_CONNECTED,
        base_growth_rate=draw_growth_rate(seed=99),
        employees_schedule={}, recession_schedule={},
        noise_seed=3, wealth_noise_seed=33,
    )))

    s.append(("4. Small city\n(40 employees @ t10)", dict(
        pop0=50_000, territory_seed=404,
        network_factor=NETWORK_ISOLATED,
        base_growth_rate=draw_growth_rate(seed=21),
        employees_schedule={10: 40}, recession_schedule={},
        noise_seed=4, wealth_noise_seed=44,
        geo_ceiling_override=75_000,  # K_base=46.5k < 50k; K_w40emp=78.5k; brake=+0.363 → ~+25%
    )))

    s.append(("5. Large city\n(110 employees from t1)", dict(
        pop0=250_000, territory_seed=505,
        network_factor=NETWORK_CONNECTED,
        base_growth_rate=0.014,  # high fixed rate: aggressive investment in booming market
        employees_schedule={1: 110}, recession_schedule={},
        noise_seed=5, wealth_noise_seed=55,
        geo_ceiling_override=560_000,  # K_base=347k > 250k; K_w110=435k; brake=+0.425; target +45-55%
    )))

    s.append(("6. Medium city\n(mild recession t40-55)", dict(
        pop0=120_000, territory_seed=606,
        network_factor=NETWORK_CONNECTED,
        base_growth_rate=draw_growth_rate(seed=55),
        employees_schedule={0: 70},
        recession_schedule={40: RECESSION_MOD_MILD, 56: 1.0},
        noise_seed=6, wealth_noise_seed=66,
        geo_ceiling_override=160_000,  # K_base=99.2k < 120k; K_w70emp=99.2+56=155.2k; brake=+0.227
    )))

    s.append(("7. Medium city\n(severe recession t40-55)", dict(
        pop0=120_000, territory_seed=707,
        network_factor=NETWORK_CONNECTED,
        base_growth_rate=draw_growth_rate(seed=55),
        employees_schedule={0: 70},
        recession_schedule={40: RECESSION_MOD_SEVERE, 56: 1.0},
        noise_seed=7, wealth_noise_seed=77,
        geo_ceiling_override=138_000,  # tight ceiling; combined with severe recession → +5-15% net
    )))

    s.append(("8. Small city\n(AI: 10 employees @ t20)", dict(
        pop0=40_000, territory_seed=808,
        network_factor=NETWORK_ISOLATED,
        base_growth_rate=draw_growth_rate(seed=88),
        employees_schedule={20: 10}, recession_schedule={},
        noise_seed=8, wealth_noise_seed=88,
    )))

    s.append(("9. Large city\n(firms close @ t80)", dict(
        pop0=280_000, territory_seed=909,
        network_factor=NETWORK_CONNECTED,
        base_growth_rate=0.013,  # fixed rate: this city was thriving pre-abandonment
        employees_schedule={0: 90, 80: 0}, recession_schedule={},
        noise_seed=9, wealth_noise_seed=99,
        geo_ceiling_override=380_000,  # K_base=235.6k < 280k; K_w90=307.6k > 280k; brake=+0.089
                                       # after t80 with 0 emp: K=235.6k < pop → brake negative → kink ✓
    )))

    s.append(("10. City B (ignored,\nnetwork from City A)", None))

    return s


def build_scenario_10(city_a_history):
    """
    City B is an ignored city adjacent to the heavily-invested City A (scenario 5).
    It receives no direct investment but benefits from City A's wealth via the
    network effect. This isolates the neighbourhood wealth spillover mechanic.
    """
    def neighbor_fn(t):
        return [(city_a_history["population"][t], city_a_history["wealth_index"][t])]

    return dict(
        pop0=100_000, territory_seed=1010,
        network_factor=NETWORK_ISOLATED,
        base_growth_rate=draw_growth_rate(seed=44),
        employees_schedule={}, recession_schedule={},
        noise_seed=10, wealth_noise_seed=10,
        neighbor_fn=neighbor_fn,
    )


# =============================================================================
# TABLE OUTPUT
# =============================================================================


REPORT_TURNS = [0, 50, 100, 150, 200]


def _territory_factor_display(pop0, territory_seed):
    rng = random.Random(territory_seed)
    return round(math.exp(rng.gauss(0, TERRITORY_SIGMA)), 2)


def print_table(name, kwargs, history):
    title = name.replace("\n", " ")
    geo   = history["geo_ceil"]
    tf    = _territory_factor_display(kwargs["pop0"], kwargs["territory_seed"]) if kwargs else "n/a"

    print(f"\n{'='*92}")
    print(f"  {title}")
    if kwargs:
        print(f"  wealth₀={history['wealth0']:.3f}  |  geoCeiling={geo:,}  |  "
              f"territoryFactor={tf}  |  pop₀={kwargs['pop0']:,}")
    print(f"{'='*92}")
    print(f"{'Turn':>6}  {'Population':>12}  {'WealthIdx':>9}  "
          f"{'LandValue':>10}  {'A-Large cost':>13}  {'Locations':>9}")
    print(f"{'-'*6}  {'-'*12}  {'-'*9}  {'-'*10}  {'-'*13}  {'-'*9}")

    for t in REPORT_TURNS:
        pop = history["population"][t]
        wi  = history["wealth_index"][t]
        lv  = history["land_value"][t]
        al  = history["a_large_cost"][t]
        cum = sum(1 for ut in history["unlock_turns"] if ut <= t)
        print(f"{t:>6}  {pop:>12,.0f}  {wi:>9.3f}  "
              f"{lv:>10,.0f}  {al:>13,.0f}  {cum:>9}")

    print()
    if history["unlock_details"]:
        print("  Location unlocks:")
        for (ut, sz, cls) in history["unlock_details"]:
            print(f"    Turn {ut:>3}: {sz:6s} / Class {cls}")
    else:
        print("  No location unlocks.")


def print_summary(scenarios, all_histories):
    print("\n" + "=" * 108)
    print("  SUMMARY — change over all 200 turns")
    print("=" * 108)
    print(f"{'#':<3}  {'Scenario':<34}  {'geoCeil':>8}  {'terrFact':>8}  "
          f"{'Pop Δ':>8}  {'Wi Δ':>8}  {'LV end':>10}")
    print(f"{'-'*3}  {'-'*34}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*10}")

    for idx, ((name, kwargs), h) in enumerate(zip(scenarios, all_histories), 1):
        label  = name.replace("\n", " ")[:34]
        ps, pe = h["population"][0],   h["population"][-1]
        ws, we = h["wealth_index"][0],  h["wealth_index"][-1]
        lv_end = h["land_value"][-1]
        pp     = (pe - ps) / ps * 100
        wp     = (we - ws) / ws * 100
        geo    = h["geo_ceil"]
        tf     = _territory_factor_display(kwargs["pop0"], kwargs["territory_seed"]) if kwargs else "-"
        print(
            f"{idx:<3}  {label:<34}  {geo:>8,}  {tf:>8}  "
            f"{'+' if pp >= 0 else ''}{pp:>7.1f}%  "
            f"{'+' if wp >= 0 else ''}{wp:>7.1f}%  "
            f"{lv_end:>10,.0f}"
        )
    print()


# =============================================================================
# CHARTS
# =============================================================================


DARK_BG      = "#111827"
PANEL_BG     = "#1F2937"
GRID_COLOR   = "#374151"
POP_COLOR    = "#60A5FA"
WEALTH_COLOR = "#FBBF24"
LV_COLOR     = "#A78BFA"
REC_COLOR    = "#EF4444"
UNLOCK_COLOR = "#34D399"
GEO_COLOR    = "#F97316"


def _style_axes(ax, ax2=None):
    ax.set_facecolor(PANEL_BG)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID_COLOR)
    ax.tick_params(colors="#9CA3AF", labelsize=7)
    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_color("#9CA3AF")
    if ax2:
        ax2.set_facecolor(PANEL_BG)
        for spine in ax2.spines.values():
            spine.set_edgecolor(GRID_COLOR)
        ax2.tick_params(colors=WEALTH_COLOR, labelsize=7)
        for lbl in ax2.get_yticklabels():
            lbl.set_color(WEALTH_COLOR)


def _recession_bands(recession_schedule):
    bands, start, smod = [], None, None
    for (t, mod) in sorted(recession_schedule.items()):
        if mod < 1.0 and start is None:
            start, smod = t, mod
        elif mod >= 1.0 and start is not None:
            bands.append((start, t, smod))
            start = None
    if start is not None:
        bands.append((start, TURNS, smod))
    return bands


def plot_population_wealth(scenarios, all_histories):
    fig, axes = plt.subplots(5, 2, figsize=(16, 26))
    fig.patch.set_facecolor(DARK_BG)
    plt.subplots_adjust(hspace=0.55, wspace=0.40)
    turns_arr = np.arange(TURNS + 1)

    for idx, ((name, kwargs), h) in enumerate(zip(scenarios, all_histories)):
        row, col = divmod(idx, 2)
        ax  = axes[row][col]
        ax2 = ax.twinx()
        _style_axes(ax, ax2)

        ax.plot(turns_arr, h["population"],   color=POP_COLOR,    lw=1.6)
        ax2.plot(turns_arr, h["wealth_index"], color=WEALTH_COLOR, lw=1.4, linestyle="--")

        geo = h["geo_ceil"]
        ax.axhline(geo, color=GEO_COLOR, lw=0.9, linestyle=":", alpha=0.8)
        ax.text(4, geo * 1.015, f"geo ceil {geo/1000:.0f}k",
                color=GEO_COLOR, fontsize=5.5, va="bottom")

        rsched = kwargs.get("recession_schedule", {}) if kwargs else {}
        for (rs, re, rm) in _recession_bands(rsched):
            ax.axvspan(rs, re, color=REC_COLOR,
                       alpha=0.20 if rm > 0 else 0.40, zorder=0)

        for ut in h["unlock_turns"]:
            ax.axvline(ut, color=UNLOCK_COLOR, lw=0.7, alpha=0.55)

        tf = _territory_factor_display(kwargs["pop0"], kwargs["territory_seed"]) if kwargs else ""
        ax.set_title(f"{name}  [tf={tf}]",
                     color="white", fontsize=7.5, pad=4, loc="left", fontweight="bold")
        ax.set_xlabel("Turn", color="#6B7280", fontsize=7)
        ax.set_ylabel("Population", color=POP_COLOR, fontsize=7)
        ax2.set_ylabel("Wealth Index", color=WEALTH_COLOR, fontsize=7)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}k"))
        ax2.set_ylim(0.0, 1.0)

    from matplotlib.lines import Line2D
    fig.legend(handles=[
        Line2D([0],[0], color=POP_COLOR,    lw=2,           label="Population"),
        Line2D([0],[0], color=WEALTH_COLOR, lw=2, ls="--",  label="Wealth Index"),
        Line2D([0],[0], color=GEO_COLOR,    lw=1.2, ls=":", label="Geographic ceiling"),
        Line2D([0],[0], color=REC_COLOR,    lw=8, alpha=.3, label="Recession"),
        Line2D([0],[0], color=UNLOCK_COLOR, lw=1.5,         label="Location unlock"),
    ], loc="lower center", ncol=5, framealpha=0.2, facecolor=PANEL_BG,
       edgecolor=GRID_COLOR, labelcolor="white", fontsize=8,
       bbox_to_anchor=(0.5, 0.005))

    fig.suptitle("City Growth Simulation v7 — Population & Wealth",
                 color="white", fontsize=12, fontweight="bold", y=0.997)
    fig.savefig("city_growth_v7.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    print("Saved: city_growth_v7.png")


def plot_land_value(scenarios, all_histories):
    fig, axes = plt.subplots(5, 2, figsize=(16, 26))
    fig.patch.set_facecolor(DARK_BG)
    plt.subplots_adjust(hspace=0.55, wspace=0.40)
    turns_arr = np.arange(TURNS + 1)

    for idx, ((name, kwargs), h) in enumerate(zip(scenarios, all_histories)):
        row, col = divmod(idx, 2)
        ax  = axes[row][col]
        ax2 = ax.twinx()
        _style_axes(ax, ax2)

        ax.plot(turns_arr, h["land_value"],    color=LV_COLOR,     lw=1.6)
        ax2.plot(turns_arr, h["wealth_index"], color=WEALTH_COLOR, lw=1.4, linestyle="--")

        rsched = kwargs.get("recession_schedule", {}) if kwargs else {}
        for (rs, re, rm) in _recession_bands(rsched):
            ax.axvspan(rs, re, color=REC_COLOR,
                       alpha=0.20 if rm > 0 else 0.40, zorder=0)

        ax.set_title(name, color="white", fontsize=8, pad=4, loc="left", fontweight="bold")
        ax.set_xlabel("Turn", color="#6B7280", fontsize=7)
        ax.set_ylabel("Land Value (€)", color=LV_COLOR, fontsize=7)
        ax2.set_ylabel("Wealth Index", color=WEALTH_COLOR, fontsize=7)
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"€{x/1000:.0f}k"))
        ax2.set_ylim(0.0, 1.0)
        for lbl in ax.get_yticklabels():
            lbl.set_color(LV_COLOR)

    from matplotlib.lines import Line2D
    fig.legend(handles=[
        Line2D([0],[0], color=LV_COLOR,     lw=2,           label="Land Value"),
        Line2D([0],[0], color=WEALTH_COLOR, lw=2, ls="--",  label="Wealth Index"),
        Line2D([0],[0], color=REC_COLOR,    lw=8, alpha=.3, label="Recession"),
    ], loc="lower center", ncol=3, framealpha=0.2, facecolor=PANEL_BG,
       edgecolor=GRID_COLOR, labelcolor="white", fontsize=8,
       bbox_to_anchor=(0.5, 0.005))

    fig.suptitle("City Growth Simulation v7 — Land Value & Wealth",
                 color="white", fontsize=12, fontweight="bold", y=0.997)
    fig.savefig("land_value_v7.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    print("Saved: land_value_v7.png")


# =============================================================================
# ENTRY POINT
# =============================================================================


if __name__ == "__main__":
    random.seed(0)

    scenarios     = build_scenarios()
    all_histories = []

    print("Running 10 city growth scenarios (v7)...")

    for idx, (name, kwargs) in enumerate(scenarios):
        if kwargs is None:
            kwargs = build_scenario_10(all_histories[4])
            scenarios[idx] = (name, kwargs)

        hist = simulate_city(**kwargs)
        all_histories.append(hist)
        print_table(name, kwargs, hist)

    print_summary(scenarios, all_histories)
    plot_population_wealth(scenarios, all_histories)
    plot_land_value(scenarios, all_histories)
    print("\nDone.")