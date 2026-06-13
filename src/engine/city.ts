import type { GameState, FirmType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { sampleNormal, clamp } from "./utils";

// Post-MVP: full city growth tick with population change, wealth trends, and employment effects.
// Post-MVP: city events (factory closure, population boom, industrial decline).
// Post-MVP: player's own firms influence city wealth and industrial identity over time.
// Post-MVP: cluster bonuses for concentrated firm types in one city.

/**
 * Effective demand multiplier for a city.
 * Formula: demandModifier × (0.5 + wealthIndex)
 * At defaults (wealthIndex=0.5, demandModifier=1.0) this returns 1.0 — no behavioral change.
 * Wealthier cities buy more; poorer cities buy less.
 */
export function getCityDemandMultiplier(state: GameState, cityId: string): number {
  const city = state.cityNodes[cityId];
  if (!city) return 1.0;
  return city.demandModifier * (0.5 + city.wealthIndex);
}

/**
 * Apply small random noise to each city's wealthIndex each turn.
 * Clamps to [wealthMin, wealthMax]. Called from tick.ts before retail sales.
 */
export function tickCities(state: GameState): void {
  const cfg = GameConfig.cities;
  for (const city of Object.values(state.cityNodes)) {
    const noise = sampleNormal(0, cfg.wealthNoiseStdDev);
    city.wealthIndex = clamp(city.wealthIndex + noise, cfg.wealthMin, cfg.wealthMax);
  }
}

/**
 * Industrial cluster bonus for a given firm type in a city.
 * Post-MVP: grows with firm concentration, rewards specialization.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getCityIndustrialBonus(_state: GameState, _cityId: string, _firmType: FirmType): number {
  // Post-MVP: cluster bonus grows with firm concentration, rewards specialization.
  return 1.0;
}
