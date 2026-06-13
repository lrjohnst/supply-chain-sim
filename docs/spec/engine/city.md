## city.ts

**Confirmed behavior:**
- tickCities called each turn before retail sales
- wealthIndex per city: Gaussian noise (σ=0.005) applied each turn, clamped 0.1-0.9
- getCityDemandMultiplier: demandModifier × (0.5 + wealthIndex). At defaults equals 1.0
- getCityIndustrialBonus: returns 1.0 always (placeholder)
- wealthIndex initial values: towns 0.5, cities 0.6, harbor city 0.7
- demandModifier initial value: 1.0 for all

**Open questions:**
- Post-MVP: full city growth, population change, wealth trends, employment effects, cluster bonuses
