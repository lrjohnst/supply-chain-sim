import type { InvestmentType, FirmType, ProductId, RecipeKey } from "../types";

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
    turnsNormal: 200,
    turnsEpic: 600,
    turnsSpeed: 100,
    quartersPerYear: 4,
    barcodeAvailableTurn: 16,                   // 1984 Q1
    multiYearContractRevenueThreshold: 100_000,
    netWorthWinThreshold: 5_000_000,
  },

  // ----------------------------------------------------------
  // Starting conditions
  // ----------------------------------------------------------
  player: {
    startingCash: 100_000,
  },

  ai: {
    startingCash: 100_000,
    startingCorporationName: "Rival Corp",
    startingCityNodeId: "city_b",
    seededChains: ["ice_cream"] as string[],
    debtToRevenueRatioLimit: 2.0,
    tenderMarginMinimum: 0.05,
  },

  // ----------------------------------------------------------
  // Map / transport
  // ----------------------------------------------------------
  map: {
    // Cost per unit per link traversed (non-harbor-access nodes pay this
    // for every link between their node and the nearest harbor-access node)
    transportCostPerLink: 0.15,        // € per unit per link
    linkCostReductionPerLevel: 0.15,   // 15% reduction per upgrade level
    maxLinkInvestmentLevel: 3,
    linkCapacityBase: 500,
    linkCapacityPerLevel: 250,
  },

  // ----------------------------------------------------------
  // Spot purchase premium (buying without a contract)
  // ----------------------------------------------------------
  spotPurchasePremium: 0.12,   // 12% above contract/harbor price

  // ----------------------------------------------------------
  // Firm slots by node size
  // ----------------------------------------------------------
  firmSlots: {
    large_city: 6,
    medium_city: 4,
    town: 2,
  },

  // ----------------------------------------------------------
  // Investment capital costs and build times
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

    maxPerFirm: {
      crop_fields: 3,
      livestock_facilities: 2,
      irrigation_systems: 1,
      cold_storage: 1,
      processing_yard_farm: 1,
      seasonal_planning_unit: 1,
      training_farm: 1,
      production_line: 4,
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

    /**
     * Turns a production line spends commissioning after recipe is configured.
     * No inputs consumed, no outputs produced during this phase.
     * Later MVP: player innovations can reduce this value.
     */
    productionLineStartupTurns: 2,

    /**
     * Startup cost per turn = normal operating cost × startupCostFraction.
     * Charged each turn the line is in the starting_up phase.
     * Direct P&L expense, not capitalised.
     * Post-MVP: investment costs may be capitalized and depreciated
     * (afgeschreven) rather than expensed immediately. Startup costs
     * remain direct expenses.
     */
    startupCostFraction: 0.3,

    // Operating cost per turn added by each completed investment.
    // Empty firm = zero overhead. Costs grow as the firm grows.
    operatingCostPerTurn: {
      crop_fields: 400,
      livestock_facilities: 600,
      irrigation_systems: 150,
      cold_storage: 200,
      processing_yard_farm: 300,
      seasonal_planning_unit: 100,
      training_farm: 200,
      production_line: 800,
      storage_facilities: 200,
      packaging_lines: 300,
      quality_lab: 400,
      logistics_hub: 350,
      processing_unit: 300,
      branding_facility: 400,
      training_factory: 300,
      barcode_scanning: 100,
      grocery_section: 500,
      cosmetics_section: 400,
      hardware_section: 400,
      electronics_section: 500,
      clothing_section: 400,
      pharmacy_section: 500,
      warehouse_capacity: 150,
      training_store: 200,
    } satisfies Record<InvestmentType, number>,
  },

  firmInvestmentSlotLimit: 8,

  // ----------------------------------------------------------
  // Valid investment types per firm type
  // Used by startInvestment guard and the investment UI.
  // mine: post-MVP placeholder — no valid investments yet.
  // ----------------------------------------------------------
  validInvestments: {
    farm: [
      "crop_fields", "livestock_facilities", "irrigation_systems", "cold_storage",
      "processing_yard_farm", "seasonal_planning_unit", "training_farm",
    ],
    factory: [
      "production_line", "storage_facilities", "packaging_lines", "quality_lab",
      "logistics_hub", "processing_unit", "branding_facility", "training_factory",
      "barcode_scanning",
    ],
    store: [
      "grocery_section", "electronics_section", "cosmetics_section", "hardware_section",
      "clothing_section", "pharmacy_section", "warehouse_capacity", "training_store",
      "barcode_scanning",
    ],
    mine: [],
  } satisfies Record<FirmType, InvestmentType[]>,

  // ----------------------------------------------------------
  // Harbor — base prices (numeric balancing values)
  // Only products with a non-zero price are listed here; harbor.ts
  // reads these via getBasePrice() which returns 0 for unlisted products.
  // The sold-product list is derived from the product registry (purchaseSources).
  // ----------------------------------------------------------
  harborBasePrices: {
    bauxite:              31,
    laptop_whitelabel:   320,
    ice_cream_strawberry:  1.4,
    printer_branded:      95,
  } as Partial<Record<ProductId, number>>,

  // ----------------------------------------------------------
  // Harbor price noise
  // ----------------------------------------------------------
  harborPrices: {
    /** Std dev of per-turn noise as a fraction of base price. */
    noiseStdDev: 0.01,
  },

  // ----------------------------------------------------------
  // Retail benchmark prices (player can deviate; elasticity applies)
  // ----------------------------------------------------------
  retailBenchmarkPrices: {
    raw_chicken: 0,
    chicken: 9.5,
    chicken_soup: 7.0,
    bauxite: 0,
    alumina: 0,
    aluminium: 0,
    laptop_whitelabel: 0,
    laptop_branded: 680,
    ice_cream_strawberry: 3.50,
    printer_branded: 189,
  } satisfies Record<ProductId, number>,

  // Price elasticity: demand multiplier per 1% deviation from benchmark.
  // 0.4 means 10% price increase → 4% demand decrease.
  retailElasticity: {
    raw_chicken: 0,
    chicken: 0.5,
    chicken_soup: 0.4,
    bauxite: 0,
    alumina: 0,
    aluminium: 0,
    laptop_whitelabel: 0,
    laptop_branded: 0.8,
    ice_cream_strawberry: 0.6,
    printer_branded: 0.7,
  } satisfies Record<ProductId, number>,

  // ----------------------------------------------------------
  // Sales ramp curve
  // A new product starts at rampStartFraction of max demand.
  // It reaches full demand after rampTurns turns (linear for MVP).
  // ----------------------------------------------------------
  salesRamp: {
    rampStartFraction: 0.1,   // 10% of max demand on first turn
    rampTurns: {
      grocery: 6,             // food items ramp in 6 turns
      electronics: 12,        // electronics ramp in 12 turns
    },
  },

  // ----------------------------------------------------------
  // Production recipes
  // ----------------------------------------------------------
  production: {
    chicken: {
      inputProduct: "raw_chicken" as ProductId,
      inputQuantity: 1.4,
      outputProduct: "chicken" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: true,
      requiresBranding: false,
      maxBatchSizePerTurn: 200,
    },
    chicken_soup: {
      inputProduct: "raw_chicken" as ProductId,
      inputQuantity: 0.6,
      outputProduct: "chicken_soup" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: true,
      requiresBranding: false,
      maxBatchSizePerTurn: 200,
    },
    alumina_refining: {
      inputProduct: "bauxite" as ProductId,
      inputQuantity: 2.0,
      outputProduct: "alumina" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: false,
      requiresBranding: false,
      maxBatchSizePerTurn: 300,
    },
    aluminium_smelting: {
      inputProduct: "alumina" as ProductId,
      inputQuantity: 1.93,
      outputProduct: "aluminium" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 2,
      requiresPackaging: false,
      requiresBranding: false,
      maxBatchSizePerTurn: 150,
    },
    laptop_branding: {
      inputProduct: "laptop_whitelabel" as ProductId,
      inputQuantity: 1,
      outputProduct: "laptop_branded" as ProductId,
      outputQuantity: 1,
      turnsPerBatch: 1,
      requiresPackaging: false,
      requiresBranding: true,
      maxBatchSizePerTurn: 100,
    },
  } satisfies Record<RecipeKey, {
    inputProduct: ProductId; inputQuantity: number;
    outputProduct: ProductId; outputQuantity: number;
    turnsPerBatch: number; requiresPackaging: boolean; requiresBranding: boolean;
    maxBatchSizePerTurn: number;
  }>,

  // ----------------------------------------------------------
  // Loans
  // ----------------------------------------------------------
  loans: {
    baseAnnualInterestRate: 0.08,
    maxLoanMultiple: 3,
    minDurationTurns: 4,
    maxDurationTurns: 40,
  },

  // ----------------------------------------------------------
  // Quality
  // ----------------------------------------------------------
  quality: {
    baseQuality: 0.5,
    qualityGainPerTurnWithLab: 0.02,
    qualityGainFromTraining: 0.01,
    qualityDecayWithoutTraining: 0.005,
  },

  // ----------------------------------------------------------
  // Training
  // ----------------------------------------------------------
  training: {
    minBudgetPerTurn: 0,
    maxBudgetPerTurn: 20_000,
    budgetPerFirmForEffect: 1_000,
  },

  // ----------------------------------------------------------
  // Marketing
  // ----------------------------------------------------------
  marketing: {
    minBudgetPerTurn: 0,
    maxBudgetPerTurn: 50_000,
    demandMultiplierPerUnit: 0.00001,
    maxDemandMultiplier: 1.5,
  },

  // ----------------------------------------------------------
  // Demand noise
  // ----------------------------------------------------------
  demand: {
    /** Std dev of per-turn noise as a fraction of base demand. */
    noiseStdDev: 0.02,
  },

  // ----------------------------------------------------------
  // Macro events — each category has its own frequency & probability
  // ----------------------------------------------------------

  recessionEvents: {
    checkFrequencyTurns: 8,
    probability: 0.15,
    /** Turns after a recession ends before another can begin. */
    cooldownTurns: 12,
    severityMin: 0.5,   // 1.0 = no effect, 0.0 = zero demand
    severityMax: 0.95,
    durationMin: 2,
    durationMax: 12,
    /**
     * Skew for the severity distribution. 0 = uniform between min/max.
     * Non-zero skew is reserved for post-MVP; currently unused.
     */
    skew: 0,
    /** Std dev of per-turn wobble on the fixed severity multiplier. */
    severityNoiseStdDev: 0.02,
  },

  commodityShockEvents: {
    checkFrequencyTurns: 4,
    probability: 0.25,
    shockMultiplierMin: 0.85,
    shockMultiplierMax: 1.20,
    /** Mean turns for price to normalise back to baseline. */
    normalizationMeanTurns: 8,
    /** Std dev of the normalization duration draw. */
    normalizationStdDev: 3,
    /** Steepness of the S-curve decay (logistic k). */
    kSteepness: 0.8,
  },

  interestRateEvents: {
    checkFrequencyTurns: 4,
    probability: 0.15,
    shockMin: -0.02,
    shockMax: 0.03,
  },

  tenderEvents: {
    checkFrequencyTurns: 4,
    probability: 0.20,
  },

  // ----------------------------------------------------------
  // Economic history rolling window
  // ----------------------------------------------------------
  history: {
    rollingWindowTurns: 40,
  },

  // ----------------------------------------------------------
  // Consumer demand (per-capita per turn at benchmark price)
  // ----------------------------------------------------------
  consumerDemand: {
    perCapitaDemand: {
      chicken: 0.0025,
      chicken_soup: 0.0015,
      laptop_branded: 0.00015,
      ice_cream_strawberry: 0.004,
      printer_branded: 0.00008,
    } as Partial<Record<ProductId, number>>,
  },

  // ----------------------------------------------------------
  // Seasonal production (farm)
  // ----------------------------------------------------------
  seasonal: {
    yieldMultiplier: [0.7, 1.2, 1.1, 0.8] as [number, number, number, number],
  },

  // ----------------------------------------------------------
  // Bankruptcy early warning
  // ----------------------------------------------------------
  bankruptcy: {
    warningThresholdTurns: 10,  // warn if < 10 turns of cash remain at current burn rate
    lookbackTurns: 10,          // turns of history used to estimate average burn rate
  },

  // ----------------------------------------------------------
  // Seeded tenders at game start
  // ----------------------------------------------------------
  startingTenders: [
    {
      product: "alumina" as ProductId,
      volumeRequired: 500,
      targetUnitPrice: 92,
      minQuality: 0.4,
      durationTurns: 8,
      closeTurn: 12,
    },
    {
      product: "aluminium" as ProductId,
      volumeRequired: 300,
      targetUnitPrice: 195,
      minQuality: 0.4,
      durationTurns: 8,
      closeTurn: 12,
    },
  ],

} as const;

export type GameConfigType = typeof GameConfig;
