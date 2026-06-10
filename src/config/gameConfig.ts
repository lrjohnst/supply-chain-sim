import type { InvestmentType, ProductId, MacroEventType, FirmType } from "../types";

// ============================================================
// All gameplay parameters live here. No numeric constants
// anywhere else in the engine. Tune gameplay by editing this
// file only.
// ============================================================

export const GameConfig = {

  // ----------------------------------------------------------
  // Game structure
  // ----------------------------------------------------------
  game: {
    startYear: 1980,
    startQuarter: 1,
    turnsNormal: 200,    // 4 quarters × 50 years
    turnsEpic: 600,      // monthly turns
    turnsSpeed: 100,     // half-yearly turns
    quartersPerYear: 4,
    barcodeAvailableTurn: 16, // 1984 Q1 = turn 16 (0-indexed from 1980 Q1)
    multiYearContractRevenueThreshold: 100_000,
    netWorthWinThreshold: 5_000_000,
  },

  // ----------------------------------------------------------
  // Starting conditions
  // ----------------------------------------------------------
  player: {
    startingCash: 100_000,
    startingCorporationName: "Your Corporation",
  },

  ai: {
    startingCash: 100_000,
    startingCorporationName: "Rival Corp",
    startingCityNodeId: "city_b",     // seeded into a different city than player
    seededChains: ["ice_cream"] as string[], // chains the AI starts pursuing
    debtToRevenueRatioLimit: 2.0,     // AI won't borrow beyond this
    tenderMarginMinimum: 0.05,        // AI only bids if projected margin >= 5%
  },

  // ----------------------------------------------------------
  // Map
  // ----------------------------------------------------------
  map: {
    defaultLinkCost: 10,          // € per unit transported at investment level 0
    linkCostReductionPerLevel: 0.15, // 15% reduction per upgrade level
    maxLinkInvestmentLevel: 3,
    linkCapacityBase: 500,        // units per turn at level 0
    linkCapacityPerLevel: 250,    // additional capacity per upgrade level
  },

  // ----------------------------------------------------------
  // Firm slots by node size
  // ----------------------------------------------------------
  firmSlots: {
    large_city: 6,
    medium_city: 4,
    town: 2,
  },

  // ----------------------------------------------------------
  // Investment costs and build times (turns to complete)
  // ----------------------------------------------------------
  investments: {
    cost: {
      crop_fields: 20_000,
      livestock_facilities: 30_000,
      irrigation_systems: 15_000,
      cold_storage: 12_000,
      processing_yard_farm: 18_000,
      seasonal_planning_unit: 10_000,
      training_farm: 5_000,
      production_line: 40_000,
      storage_facilities: 15_000,
      packaging_lines: 20_000,
      quality_lab: 25_000,
      logistics_hub: 30_000,
      processing_unit: 22_000,
      branding_facility: 35_000,
      training_factory: 8_000,
      barcode_scanning: 18_000,
      grocery_section: 25_000,
      cosmetics_section: 20_000,
      hardware_section: 22_000,
      electronics_section: 28_000,
      clothing_section: 20_000,
      pharmacy_section: 30_000,
      warehouse_capacity: 12_000,
      training_store: 5_000,
    } satisfies Record<InvestmentType, number>,

    buildTurns: {
      crop_fields: 2,
      livestock_facilities: 3,
      irrigation_systems: 2,
      cold_storage: 1,
      processing_yard_farm: 2,
      seasonal_planning_unit: 1,
      training_farm: 1,
      production_line: 4,
      storage_facilities: 2,
      packaging_lines: 2,
      quality_lab: 3,
      logistics_hub: 3,
      processing_unit: 2,
      branding_facility: 3,
      training_factory: 1,
      barcode_scanning: 1,
      grocery_section: 2,
      cosmetics_section: 2,
      hardware_section: 2,
      electronics_section: 2,
      clothing_section: 2,
      pharmacy_section: 2,
      warehouse_capacity: 1,
      training_store: 1,
    } satisfies Record<InvestmentType, number>,

    // Max instances of each investment type per firm
    maxPerFirm: {
      crop_fields: 3,
      livestock_facilities: 2,
      irrigation_systems: 1,
      cold_storage: 1,
      processing_yard_farm: 1,
      seasonal_planning_unit: 1,
      training_farm: 1,
      production_line: 4,        // multiple lines per factory
      storage_facilities: 2,
      packaging_lines: 2,
      quality_lab: 1,
      logistics_hub: 1,
      processing_unit: 2,
      branding_facility: 1,
      training_factory: 1,
      barcode_scanning: 1,
      grocery_section: 1,
      cosmetics_section: 1,
      hardware_section: 1,
      electronics_section: 1,
      clothing_section: 1,
      pharmacy_section: 1,
      warehouse_capacity: 3,
      training_store: 1,
    } satisfies Record<InvestmentType, number>,
  },

  // ----------------------------------------------------------
  // Total investment slot limit per firm
  // ----------------------------------------------------------
  firmInvestmentSlotLimit: 8,

  // ----------------------------------------------------------
  // Harbor baseline prices (€ per unit)
  // ----------------------------------------------------------
  harborPrices: {
    raw_chicken: 2.5,
    chicken: 6.0,
    chicken_soup: 4.5,
    bauxite: 31,
    alumina: 85,
    aluminium: 180,
    laptop_whitelabel: 320,
    laptop_branded: 0,           // harbor does not sell branded laptops
    ice_cream_strawberry: 1.8,
    printer_branded: 0,          // harbor does not sell branded printers
  } satisfies Record<ProductId, number>,

  // Harbor price fluctuation bounds (multiplier range per macro event)
  harborPriceShockMin: 0.85,
  harborPriceShockMax: 1.20,

  // ----------------------------------------------------------
  // Retail prices (B2C — store sells to consumer)
  // ----------------------------------------------------------
  retailPrices: {
    raw_chicken: 0,               // not sold retail
    chicken: 9.5,
    chicken_soup: 7.0,
    bauxite: 0,                   // not sold retail
    alumina: 0,                   // not sold retail
    aluminium: 0,                 // not sold retail (tender only)
    laptop_whitelabel: 0,         // not sold retail unbranded
    laptop_branded: 680,
    ice_cream_strawberry: 3.2,
    printer_branded: 0,           // placeholder, set in map data
  } satisfies Record<ProductId, number>,

  // Retail price fluctuation (consumer demand sensitivity)
  retailDemandElasticity: 0.3,   // 1% price increase → 0.3% demand decrease

  // ----------------------------------------------------------
  // Production recipes
  // ----------------------------------------------------------
  production: {
    chicken: {
      inputProduct: "raw_chicken" as ProductId,
      inputQuantity: 1.4,    // kg raw per kg output
      outputProduct: "chicken" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: true,
    },
    chicken_soup: {
      inputProduct: "raw_chicken" as ProductId,
      inputQuantity: 0.6,
      outputProduct: "chicken_soup" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: true,
    },
    alumina_refining: {
      inputProduct: "bauxite" as ProductId,
      inputQuantity: 2.0,    // tonnes bauxite per tonne alumina
      outputProduct: "alumina" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: false,
    },
    aluminium_smelting: {
      inputProduct: "alumina" as ProductId,
      inputQuantity: 1.93,   // tonnes alumina per tonne aluminium
      outputProduct: "aluminium" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 2,
      requiresPackaging: false,
    },
    laptop_branding: {
      inputProduct: "laptop_whitelabel" as ProductId,
      inputQuantity: 1,
      outputProduct: "laptop_branded" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: false,
    },
  },

  // ----------------------------------------------------------
  // Loans
  // ----------------------------------------------------------
  loans: {
    baseAnnualInterestRate: 0.08,   // 8% p.a.
    maxLoanMultiple: 3,              // max loan = 3× current cash
    minDurationTurns: 4,
    maxDurationTurns: 40,
    interestRateShockMin: -0.02,    // macro event can shift rate by this much
    interestRateShockMax: 0.03,
  },

  // ----------------------------------------------------------
  // Quality system
  // ----------------------------------------------------------
  quality: {
    baseQuality: 0.5,
    qualityGainPerTurnWithLab: 0.02,
    qualityGainFromTraining: 0.01,
    qualityDecayWithoutTraining: 0.005,
    barcodeQualityBonus: 0.05,      // one-time bonus on investment
  },

  // ----------------------------------------------------------
  // Training
  // ----------------------------------------------------------
  training: {
    minBudgetPerTurn: 0,
    maxBudgetPerTurn: 20_000,
    budgetPerFirmForEffect: 2_000,  // budget needed per firm to prevent decay
  },

  // ----------------------------------------------------------
  // Marketing
  // ----------------------------------------------------------
  marketing: {
    minBudgetPerTurn: 0,
    maxBudgetPerTurn: 50_000,
    demandMultiplierPerUnit: 0.00001, // demand boost per € of marketing spend
    maxDemandMultiplier: 1.5,
  },

  // ----------------------------------------------------------
  // Macro events
  // ----------------------------------------------------------
  macroEvents: {
    checkFrequencyTurns: 4,         // evaluate for macro events every 4 turns
    baseEventProbability: 0.25,     // 25% chance of an event each check
    types: [
      "interest_rate_change",
      "recession",
      "commodity_price_shock",
      "tender_opportunity",
      "tender_closure",
    ] as MacroEventType[],
    recessionDemandMultiplier: 0.75,
    recessionDurationTurns: 4,
  },

  // ----------------------------------------------------------
  // Consumer demand by city size (units per turn baseline)
  // ----------------------------------------------------------
  consumerDemand: {
    perCapitaDemand: {
      chicken: 0.002,
      chicken_soup: 0.001,
      laptop_branded: 0.0001,
      ice_cream_strawberry: 0.003,
      printer_branded: 0.00005,
    } as Partial<Record<ProductId, number>>,
  },

  // ----------------------------------------------------------
  // Firm operating costs (€ per turn, base)
  // ----------------------------------------------------------
  firmOperatingCosts: {
    farm: 2_000,
    factory: 5_000,
    store: 3_000,
  } satisfies Record<FirmType, number>,

  // ----------------------------------------------------------
  // Seasonal production (farm)
  // ----------------------------------------------------------
  seasonal: {
    // multiplier per quarter (Q1–Q4)
    yieldMultiplier: [0.7, 1.2, 1.1, 0.8] as [number, number, number, number],
  },

} as const;

export type GameConfigType = typeof GameConfig;
