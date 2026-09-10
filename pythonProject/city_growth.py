"""
Population Growth Sandbox
=========================
A single-scenario playground for the population growth formula:

    dP = base_growth_rate × pop × (1 - pop/K) × em × network_factor × rec_mod + noise
    K  = min(geo_ceiling, economic_capacity)
    economic_capacity = (geo_ceiling × BASE_CAPACITY_FRACTION)
                        × (1 + employee_ratio × EMPLOYMENT_K_FACTOR)

Changes from previous version:
  - network_factor moved out of K and into dP directly
    (connectedness affects growth speed, not carrying capacity)
  - geo_ceiling can now be drawn from a shifted lognormal distribution
    instead of set manually; set GEO_CEILING_MODE = "draw" to use this
  - territory draw guaranteed to land above startPop × BASE_CAPACITY_FRACTION
    by shifting the lognormal mean upward via TERRITORY_MU
  - fixed text label crash when employment markers are plotted before axes settle

Run with:
    python pop_growth_sandbox.py

Output:
    pop_growth_sandbox.png    population curve with K and geo_ceiling marked
    printed tables            formula variables at turns 0, 50, 100, 150, 200
"""

import random
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker


# =============================================================================
# PARAMETERS — everything you want to play with is here
# =============================================================================


# --- Simulation length -------------------------------------------------------

TURNS = 200 # total steps to simulate


# --- Starting city state -----------------------------------------------------

POP_START    = 40_000 # starting population
WEALTH_START = 0.288  # starting wealthIndex; not used in pop formula but shown in table
NOISE_SEED   = 8      # change to get a different noise sequence without affecting dynamics


# --- Base growth rate --------------------------------------------------------
# Intrinsic demographic tendency of the city, independent of investment.
# Positive = natural growth. Negative = structural decline.

BASE_GROWTH_RATE = 0.008 # ↑ = faster natural growth; try negative values for decline cities


# --- Carrying capacity: economic component -----------------------------------

BASE_CAPACITY_FRACTION = 0.65 # K base = geo_ceiling × this fraction, with zero employees
                              # ↑ = uninvested cities sustain more people before K bites
                              # ↓ = uninvested cities decline sooner and harder
                              # guarantee: geo_ceiling draw is always > POP_START / this value
                              # so that K_base always starts above POP_START

EMPLOYMENT_K_FACTOR    = 8   # how strongly employee ratio lifts economic capacity
                             # formula: K_base × (1 + employee_ratio × this)
                             # ↑ = a given number of employees lifts K much more
                             # ↓ = even heavy staffing barely moves K


# --- Geographic ceiling ------------------------------------------------------
# Two modes: "manual" lets you set GEO_CEILING directly.
# "draw" derives it from POP_START using sizeFactor × territoryFactor,
# guaranteeing the draw always lands above POP_START / BASE_CAPACITY_FRACTION.

GEO_CEILING_MODE = "manual" # "manual" or "draw"

# Manual mode: set this value directly
GEO_CEILING = 80_000 # ↑ = more physical room to grow
                     # try: POP_START × 1.0 (city already at ceiling)
                     #      POP_START × 2.0 (comfortable headroom)
                     #      POP_START / BASE_CAPACITY_FRACTION (K_base exactly equals startPop)

# Draw mode: geo_ceiling = POP_START × sizeFactor × territoryFactor
# sizeFactor shrinks as startPop grows (larger cities are more mature)
SIZE_FACTOR_BASE  = 4.5  # intercept; ↑ = all cities get more headroom
SIZE_FACTOR_SLOPE = 0.9  # ↑ = large cities get proportionally much less headroom
SIZE_FACTOR_MIN   = 1.4  # floor: even the largest city can still grow somewhat
SIZE_FACTOR_MAX   = 4.0  # ceiling: even the smallest city has a natural limit

# territoryFactor is drawn from lognormal(TERRITORY_MU, TERRITORY_SIGMA).
# TERRITORY_MU is shifted upward so the draw is guaranteed to land above
# POP_START / BASE_CAPACITY_FRACTION, ensuring K_base always exceeds startPop.
#
# The minimum safe mu for this guarantee (at 2.5th percentile):
#   mu_min = log(1 / BASE_CAPACITY_FRACTION) + 2 × TERRITORY_SIGMA
# At BASE_CAPACITY_FRACTION=0.65 and TERRITORY_SIGMA=0.35:
#   mu_min = log(1/0.65) + 0.70 ≈ 0.43 + 0.70 = 1.13
# TERRITORY_MU is set above this so the guarantee holds comfortably.

TERRITORY_MU    = 1.3  # ↑ = all cities get more headroom on average; Ede/Nijmegen contrast shrinks
                       # ↓ = more variation, but risk of draws landing below the safe minimum
TERRITORY_SIGMA = 0.35 # ↑ = wider spread between cramped and spacious cities
                       # ↓ = cities converge toward the sizeFactor baseline
TERRITORY_SEED  = 101  # change to get a different territory draw in "draw" mode


# --- Network factor ----------------------------------------------------------
# Now applied directly to dP, not to K.
# Affects how fast the city grows, not how large it can get.

NETWORK_FACTOR = 0.8 # ↑ = faster growth (well-connected city)
                     # ↓ = slower growth (isolated city)
                     # 1.0 = neutral; no network effect


# --- Employment schedule -----------------------------------------------------
# Step function: at each listed turn, employee count changes to that value.

EMPLOYEES_SCHEDULE = {
    20: 10, # from turn 20 onward: 10 employees
} # try: {} for zero investment, {0: 400} for immediate moderate investment


# --- Recession schedule ------------------------------------------------------

RECESSION_MOD_NORMAL = 1.0   # no recession
RECESSION_MOD_MILD   = 0.70  # mild: growth reduced to 70%
RECESSION_MOD_SEVERE = -0.30 # severe: population actively declines

RECESSION_SCHEDULE = {
    # 40: RECESSION_MOD_MILD,
    # 56: RECESSION_MOD_NORMAL,
}


# --- Noise -------------------------------------------------------------------

NOISE_STD = 0.004 # std of per-turn Gaussian noise relative to population
                  # effective noise std per turn = NOISE_STD × pop × 0.01
                  # ↑ = more quarter-to-quarter volatility
                  # ↓ = smoother curve; underlying formula easier to see


# --- Employment multiplier bounds --------------------------------------------

EMPLOYMENT_MULT_MIN = 0.1 # floor multiplier with zero employees
                          # ↑ = ignored cities grow faster on their own
                          # ↓ = ignored cities stagnate harder
EMPLOYMENT_MULT_MAX = 1.5 # ceiling multiplier even with maximum investment
                          # ↑ = heavy investment pays off more in growth speed


# =============================================================================
# FORMULA FUNCTIONS
# =============================================================================


def clamp(v, lo, hi):
    """Return v clamped to the range [lo, hi]."""
    return max(lo, min(hi, v))


def resolve_geo_ceiling():
    """
    Return the geographic ceiling for this run.

    In manual mode, returns GEO_CEILING directly.
    In draw mode, derives it from POP_START × sizeFactor × territoryFactor,
    where territoryFactor is drawn from a shifted lognormal distribution
    guaranteed to keep the draw above POP_START / BASE_CAPACITY_FRACTION.
    """
    if GEO_CEILING_MODE == "manual":
        return GEO_CEILING

    size_factor = clamp(
        SIZE_FACTOR_BASE - math.log10(POP_START) * SIZE_FACTOR_SLOPE,
        SIZE_FACTOR_MIN,
        SIZE_FACTOR_MAX,
    )
    rng = random.Random(TERRITORY_SEED)
    territory_factor = math.exp(rng.gauss(TERRITORY_MU, TERRITORY_SIGMA))
    ceiling = round(POP_START * size_factor * territory_factor)

    # Safety check: warn if draw violated the guarantee despite mu setting
    safe_minimum = POP_START / BASE_CAPACITY_FRACTION
    if ceiling < safe_minimum:
        print(f"  WARNING: geo_ceiling {ceiling:,} is below safe minimum "
              f"{safe_minimum:,.0f} (POP_START / BASE_CAPACITY_FRACTION). "
              f"Consider raising TERRITORY_MU.")
    return ceiling


def employment_mult(employees, population):
    """
    Translate employee-to-population ratio into a growth speed multiplier.

    With no employees: EMPLOYMENT_MULT_MIN (city barely grows).
    Rises linearly with ratio, capped at EMPLOYMENT_MULT_MAX.
    """
    ratio = employees / max(population, 1)
    return clamp(
        EMPLOYMENT_MULT_MIN + ratio * 20,
        EMPLOYMENT_MULT_MIN,
        EMPLOYMENT_MULT_MAX,
    )


def economic_capacity(geo_ceiling, employees, population):
    """
    Compute economic carrying capacity.

    Base = geo_ceiling × BASE_CAPACITY_FRACTION (city with no firms).
    Employment ratio lifts this via EMPLOYMENT_K_FACTOR.
    Result is capped at geo_ceiling in carrying_capacity() below.
    """
    base  = geo_ceiling * BASE_CAPACITY_FRACTION
    ratio = employees / max(population, 1)
    return base * (1 + ratio * EMPLOYMENT_K_FACTOR)


def carrying_capacity(geo_ceiling, employees, population):
    """
    Effective carrying capacity K for this turn.

    K = min(geo_ceiling, economic_capacity)

    Network factor is no longer applied here. It moves to dP directly,
    so that connectedness affects growth speed but not the population ceiling.
    """
    econ = economic_capacity(geo_ceiling, employees, population)
    return min(geo_ceiling, econ)


# =============================================================================
# SIMULATION
# =============================================================================


def run_simulation(geo_ceiling):
    """
    Run the single scenario defined by the parameters above.
    Returns a history dict with one entry per turn for all formula variables.
    """
    rng       = random.Random(NOISE_SEED)
    pop       = float(POP_START)
    employees = 0

    emp_events = sorted(EMPLOYEES_SCHEDULE.items())
    rec_events = sorted(RECESSION_SCHEDULE.items())

    history = {
        "population":    [],
        "employees":     [],
        "K":             [],
        "econ_capacity": [],
        "em":            [],
        "brake":         [],   # (1 - pop/K): the logistic brake term
        "rec_mod":       [],
        "network":       [],   # network_factor value each turn (constant here, but recorded)
        "dP":            [],
        "noise":         [],
    }

    for t in range(TURNS + 1):

        for (et, ec) in emp_events:
            if t >= et:
                employees = ec

        rec_mod = RECESSION_MOD_NORMAL
        for (et, mod) in rec_events:
            if t >= et:
                rec_mod = mod

        K     = carrying_capacity(geo_ceiling, employees, pop)
        econ  = economic_capacity(geo_ceiling, employees, pop)
        em    = employment_mult(employees, pop)
        brake = 1 - pop / K
        noise = rng.gauss(0, NOISE_STD) * pop * 0.01

        # network_factor now multiplies dP directly, not K
        dP  = BASE_GROWTH_RATE * pop * brake * em * NETWORK_FACTOR * rec_mod + noise
        pop = max(100, pop + dP)

        history["population"].append(pop)
        history["employees"].append(employees)
        history["K"].append(K)
        history["econ_capacity"].append(econ)
        history["em"].append(em)
        history["brake"].append(brake)
        history["rec_mod"].append(rec_mod)
        history["network"].append(NETWORK_FACTOR)
        history["dP"].append(dP)
        history["noise"].append(noise)

    return history


# =============================================================================
# TABLE OUTPUT
# =============================================================================


REPORT_TURNS = [0, 50, 100, 150, 200]


def print_table(history, geo_ceiling):
    """
    Print formula variable values at each report turn.
    Table 1: population and K components.
    Table 2: dP formula factors, showing exactly where growth is amplified or suppressed.
    """
    safe_min = POP_START / BASE_CAPACITY_FRACTION

    print("\n" + "=" * 104)
    print("  Population Growth Sandbox")
    print(f"  pop₀={POP_START:,}  |  base_growth_rate={BASE_GROWTH_RATE}  |  "
          f"geo_ceiling={geo_ceiling:,}  (mode: {GEO_CEILING_MODE})")
    print(f"  BASE_CAPACITY_FRACTION={BASE_CAPACITY_FRACTION}  |  "
          f"EMPLOYMENT_K_FACTOR={EMPLOYMENT_K_FACTOR}  |  "
          f"NETWORK_FACTOR={NETWORK_FACTOR}  |  NOISE_STD={NOISE_STD}")
    print(f"  K_base at t0 = {geo_ceiling * BASE_CAPACITY_FRACTION:,.0f}  |  "
          f"safe minimum geo_ceiling = {safe_min:,.0f}  "
          f"({'OK' if geo_ceiling >= safe_min else 'WARNING: below safe minimum'})")
    print("=" * 104)

    # Table 1: population and K
    print(f"\n  {'Turn':>6}  {'Population':>12}  {'K':>10}  {'GeoCeil':>10}  "
          f"{'EconCap':>10}  {'Pop/K':>7}  {'Employees':>10}")
    print(f"  {'-'*6}  {'-'*12}  {'-'*10}  {'-'*10}  {'-'*10}  {'-'*7}  {'-'*10}")
    for t in REPORT_TURNS:
        pop  = history["population"][t]
        K    = history["K"][t]
        econ = history["econ_capacity"][t]
        emps = history["employees"][t]
        print(f"  {t:>6}  {pop:>12,.0f}  {K:>10,.0f}  {geo_ceiling:>10,}  "
              f"{econ:>10,.0f}  {pop/K:>7.3f}  {emps:>10}")

    # Table 2: dP formula components
    print(f"\n  {'Turn':>6}  {'em':>6}  {'brake':>8}  {'net':>5}  {'rec_mod':>8}  "
          f"{'noise':>8}  {'dP':>10}  {'dP (no noise)':>14}")
    print(f"  {'-'*6}  {'-'*6}  {'-'*8}  {'-'*5}  {'-'*8}  {'-'*8}  {'-'*10}  {'-'*14}")
    for t in REPORT_TURNS:
        pop      = history["population"][t]
        em       = history["em"][t]
        brake    = history["brake"][t]
        rec      = history["rec_mod"][t]
        noise    = history["noise"][t]
        dP       = history["dP"][t]
        dP_clean = BASE_GROWTH_RATE * pop * brake * em * NETWORK_FACTOR * rec
        print(f"  {t:>6}  {em:>6.3f}  {brake:>8.4f}  {NETWORK_FACTOR:>5.2f}  "
              f"{rec:>8.3f}  {noise:>8.1f}  {dP:>10.1f}  {dP_clean:>14.1f}")

    print()


# =============================================================================
# CHART
# =============================================================================


DARK_BG    = "#111827"
PANEL_BG   = "#1F2937"
GRID_COLOR = "#374151"
POP_COLOR  = "#60A5FA"
K_COLOR    = "#34D399"
GEO_COLOR  = "#F97316"
REC_COLOR  = "#EF4444"
EMP_COLOR  = "#A78BFA"


def _recession_bands():
    """Convert recession schedule to (start, end, mod) tuples for shading."""
    bands, start, smod = [], None, None
    for (t, mod) in sorted(RECESSION_SCHEDULE.items()):
        if mod < 1.0 and start is None:
            start, smod = t, mod
        elif mod >= RECESSION_MOD_NORMAL and start is not None:
            bands.append((start, t, smod))
            start = None
    if start is not None:
        bands.append((start, TURNS, smod))
    return bands


def plot_population(history, geo_ceiling):
    turns_arr = np.arange(TURNS + 1)

    fig, (ax_pop, ax_dp) = plt.subplots(
        2, 1, figsize=(14, 10),
        gridspec_kw={"height_ratios": [3, 1]},
    )
    fig.patch.set_facecolor(DARK_BG)
    plt.subplots_adjust(hspace=0.35)

    for ax in (ax_pop, ax_dp):
        ax.set_facecolor(PANEL_BG)
        for spine in ax.spines.values():
            spine.set_edgecolor(GRID_COLOR)
        ax.tick_params(colors="#9CA3AF", labelsize=8)
        for lbl in ax.get_xticklabels() + ax.get_yticklabels():
            lbl.set_color("#9CA3AF")
        ax.grid(color=GRID_COLOR, lw=0.5, alpha=0.5)

    # Recession shading
    for (rs, re, rm) in _recession_bands():
        alpha = 0.20 if rm > 0 else 0.40
        ax_pop.axvspan(rs, re, color=REC_COLOR, alpha=alpha, zorder=0)
        ax_dp.axvspan(rs, re, color=REC_COLOR, alpha=alpha, zorder=0)

    # Plot data first so y-axis limits are set before placing text labels
    ax_pop.plot(turns_arr, history["K"],
                color=K_COLOR, lw=1.2, linestyle=":", alpha=0.9, label="K (carrying capacity)")
    ax_pop.axhline(geo_ceiling, color=GEO_COLOR, lw=1.0, linestyle="--", alpha=0.8,
                   label=f"Geographic ceiling ({geo_ceiling:,})")
    ax_pop.plot(turns_arr, history["population"],
                color=POP_COLOR, lw=2.0, label="Population")
    ax_pop.axhline(POP_START, color="#6B7280", lw=0.8, linestyle=":", alpha=0.6,
                   label=f"Starting population ({POP_START:,})")

    # Employment markers: placed after data so y-limits are known
    y_text = ax_pop.get_ylim()[1] * 0.97
    for (et, ec) in sorted(EMPLOYEES_SCHEDULE.items()):
        ax_pop.axvline(et, color=EMP_COLOR, lw=1.0, linestyle="--", alpha=0.7)
        ax_pop.text(et + 1, y_text, f"{ec} emp",
                    color=EMP_COLOR, fontsize=7, va="top")

    ax_pop.set_ylabel("Population", color=POP_COLOR, fontsize=9)
    ax_pop.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}k"))
    ax_pop.set_title(
        f"Population Growth Sandbox\n"
        f"pop₀={POP_START:,}  |  base_growth_rate={BASE_GROWTH_RATE}  |  "
        f"geo_ceiling={geo_ceiling:,}  |  BASE_CAPACITY_FRACTION={BASE_CAPACITY_FRACTION}  |  "
        f"EMPLOYMENT_K_FACTOR={EMPLOYMENT_K_FACTOR}  |  NETWORK_FACTOR={NETWORK_FACTOR}",
        color="white", fontsize=9, pad=8,
    )
    ax_pop.legend(loc="upper right", framealpha=0.3, facecolor=PANEL_BG,
                  edgecolor=GRID_COLOR, labelcolor="white", fontsize=8)

    # Lower panel: dP per turn
    ax_dp.plot(turns_arr, history["dP"], color=POP_COLOR, lw=1.2, alpha=0.8)
    ax_dp.axhline(0, color="#6B7280", lw=0.8, linestyle="--")
    ax_dp.set_ylabel("dP per turn", color=POP_COLOR, fontsize=9)
    ax_dp.set_xlabel("Turn", color="#6B7280", fontsize=9)

    out = "pop_growth_sandbox.png"
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"Saved: {out}")


# =============================================================================
# ENTRY POINT
# =============================================================================


if __name__ == "__main__":
    geo_ceiling = resolve_geo_ceiling()
    history     = run_simulation(geo_ceiling)
    print_table(history, geo_ceiling)
    plot_population(history, geo_ceiling)
    print("Done.")