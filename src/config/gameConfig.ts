import type { InvestmentType, FirmType, ProductId, RecipeKey, MapConfig } from "../types";

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
    seededChains: ["ice_cream"] as string[],
    debtToRevenueRatioLimit: 2.0,
    tenderMarginMinimum: 0.05,
    firmEstablishmentCost: 10_000,
    emergencyLoanAmount: 30_000,
  },

  // ----------------------------------------------------------
  // Music
  // ----------------------------------------------------------
  music: {
    bpm: 174,
    chaosR: 3.82,
    chaosInitialX: 0.7,
    melodyGain: 0.18,
    bassGain: 0.22,
    arpGain: 0.10,
    percGain: 0.9,
    chaosFillThreshold: 0.82,
    chaosStabThreshold: 0.88,
    masterVolume: 0.8,
    enabled: true,
  },

  // ----------------------------------------------------------
  // Map / transport
  // ----------------------------------------------------------
  map: {
    transportCostPerLink: 0.15,        // € per unit per link
    linkCostReductionPerLevel: 0.15,   // 15% reduction per upgrade level
    maxLinkInvestmentLevel: 3,
    linkCapacityHighway: 150,
    linkCapacityRoad:    100,
    linkCapacityPerLevel: 250,
  },

  // ----------------------------------------------------------
  // Spot purchase premium (buying without a contract)
  // ----------------------------------------------------------
  spotPurchasePremium: 0.12,   // 12% above contract/harbor price

  // ----------------------------------------------------------
  // Store slot system
  // ----------------------------------------------------------
  storeSlots: {
    /** Units of city store capacity consumed by each store size. */
    citySlotsBySize: { small: 1, medium: 2, large: 3 } as Record<"small"|"medium"|"large", number>,
    /** Demand multiplier by location class. */
    locationMultiplier: { A: 1.6, B: 1.0, C: 0.4 } as Record<"A"|"B"|"C", number>,
    /** Demand multiplier by store size. */
    sizeMultiplier: { small: 0.7, medium: 1.0, large: 1.2 } as Record<"small"|"medium"|"large", number>,
    /** Elasticity scaling by location class. A-class consumers less price-sensitive; C-class more. */
    elasticityScaling: { A: 0.6, B: 1.0, C: 1.4 } as Record<"A"|"B"|"C", number>,
    /** Investment slot limit by store size (replaces flat firmInvestmentSlotLimit for stores). */
    investmentSlotsBySize: { small: 2, medium: 4, large: 8 } as Record<"small"|"medium"|"large", number>,
    /** Max section expansion investments per section type, by store size. */
    expansionMaxBySize: { small: 1, medium: 2, large: 3 } as Record<"small"|"medium"|"large", number>,
    /** Build cost by store size. */
    buildCostBySize: { small: 8_000, medium: 12_000, large: 20_000 } as Record<"small"|"medium"|"large", number>,
    /** Land cost by location class, reflecting desirability. Added to buildCostBySize for total store cost. */
    locationClassCost: { A: 80_000, B: 40_000, C: 15_000 } as Record<"A"|"B"|"C", number>,
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
      grocery_section_expansion: 15_000,
      electronics_section_expansion: 18_000,
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
      grocery_section_expansion: 2,
      electronics_section_expansion: 2,
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
      // Expansions: absolute max is 3 (large store); size limit enforced in investments.ts
      grocery_section_expansion: 3,
      electronics_section_expansion: 3,
    } satisfies Record<InvestmentType, number>,

    /**
     * Turns a production line spends commissioning after recipe is configured.
     * No inputs consumed, no outputs produced during this phase.
     * Later MVP: player innovations can reduce this value.
     */
    productionLineStartupTurns: 2,

    /** Quality every production line starts at when first created. */
    productionLineBaseQuality: 0.4,

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
      grocery_section_expansion: 250,
      electronics_section_expansion: 300,
    } satisfies Record<InvestmentType, number>,
  },

  firmInvestmentSlotLimit: 8,

  // ----------------------------------------------------------
  // Firm base overhead — flat cost per turn from the moment a
  // firm is built, regardless of investments or activity.
  // Represents rent, security, basic utilities, minimum staff.
  // ----------------------------------------------------------
  firmBaseOverhead: {
    factory: 500,
    farm:    200,
    store:   300,
    mine:    400,
  } satisfies Record<FirmType, number>,

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
      "barcode_scanning", "grocery_section_expansion", "electronics_section_expansion",
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
    laptop_whitelabel:   280,
    ice_cream_strawberry:  1.80,
    printer_branded:      85,
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
  // Sales ramp — logistic S-curve
  //
  // rampFraction = 1 / (1 + exp(-kSteepness × (progress - midpointProgress)))
  //
  // progress is a float that advances by (unitsSold / fullRampDemand) each turn.
  // At progress=0 the curve yields ~10% of full demand.
  // Target shape (at perfect weekly sales):
  //   progress 5  → ~20% demand
  //   progress 15 → ~50% demand  (midpoint)
  //   progress 25 → ~80% demand
  //   progress 40 → ~97% demand
  //
  // Post-MVP: ramp steepness and midpoint are the primary levers for
  // difficulty scaling. Steeper curves and harsher stockout penalties
  // are one config change away.
  // ----------------------------------------------------------
  salesRamp: {
    kSteepness: 0.30,      // logistic k; higher = sharper growth transition
    midpointProgress: 7,   // progress value at 50% demand (~32 turns of perfect play)
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
    /** Leverage ratio applied to total asset value (cash + investments at cost + inventory at cost). */
    leverageRatioOnAssets: 3,
    /** Minimum total asset value used in max loan calculation. Allows loans even with near-zero cash. */
    minAssetFloorForLoan: 15_000,
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
    baseTrainingCostPerTurn: {
      farm:    200,
      factory: 400,
      store:   150,
      mine:    300,
    } as Record<string, number>,
    defaultCorporateIntensity: 50,
    qualityThreshold: 50,
  },

  // ----------------------------------------------------------
  // Store training & retail capacity
  // ----------------------------------------------------------
  storeTraining: {
    tippingPoint: 0.20,              // slider below this (as a fraction) causes decay
    maxGrowthPerTurn: 0.022,         // max trainedFraction gain per turn at slider 100% (~45 turns to fully train)
    maxDecayPerTurn: 0.02,           // max trainedFraction loss per turn at slider 0%
    capacityMin: 0.50,               // trainedFraction=0 → maxThroughput = fullRampDemand × 0.50
    capacityRange: 0.50,             // trainedFraction=1 → maxThroughput = fullRampDemand × 1.00
    baseEmployeesPerSection: {
      grocery_section:     3,
      electronics_section: 2,
      cosmetics_section:   3,
      hardware_section:    3,
      clothing_section:    3,
      pharmacy_section:    3,
    } as Partial<Record<InvestmentType, number>>,
    sizeEmployeeMultiplier: { small: 1.0, medium: 1.5, large: 2.0 } as Record<"small"|"medium"|"large", number>,
    wagePerEmployeePerTurn: 150,
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
    minQuality: 0.4,
  },

  // ----------------------------------------------------------
  // Tender contract parameters
  // ----------------------------------------------------------
  tenders: {
    contractDurationTurns: 8,
    renewalGapTurns: 4,
    qualityDriftPerCycle: 0.02,
    volumeGrowthMean: 1.05,
    volumeGrowthStdDev: 0.1,
    incumbentNoticeTurns: 1,
    /** Warn when line quality is within this margin above the contract threshold. */
    breachWarningQualityMargin: 0.1,
    /** Re-emit breach warnings at most once every N turns while risk persists. */
    breachWarningIntervalTurns: 5,
  },

  // ----------------------------------------------------------
  // Economic history rolling window
  // ----------------------------------------------------------
  history: {
    rollingWindowTurns: 40,
  },

  // ----------------------------------------------------------
  // Transaction ledger rolling window
  // Keep at least as many turns as the bankruptcy lookback (10).
  // Trimming prevents unbounded growth over long games.
  // ----------------------------------------------------------
  transactions: {
    rollingWindowTurns: 40,
  },

  // ----------------------------------------------------------
  // Consumer demand (per-capita per turn at benchmark price)
  // ----------------------------------------------------------
  consumerDemand: {
    perCapitaDemand: {
      chicken: 0.0025,
      chicken_soup: 0.0015,
      laptop_branded: 0.0003,
      ice_cream_strawberry: 0.004,
      printer_branded: 0.0004,
    } as Partial<Record<ProductId, number>>,
  },

  // ----------------------------------------------------------
  // Seasonal production (farm)
  // ----------------------------------------------------------
  seasonal: {
    yieldMultiplier: [0.7, 1.2, 1.1, 0.8] as [number, number, number, number],
  },

  // ----------------------------------------------------------
  // Contracts — breach thresholds and fines
  // ----------------------------------------------------------
  contracts: {
    /** Fine paid by the breaching seller to the harmed buyer on breach declaration. */
    breachFineAmount: 5_000,
    /** Cumulative units short-delivered before breach conditions are met. */
    volumeShortfallBreachThreshold: 50,
    /** Consecutive turns with quality below threshold before breach conditions are met. */
    qualityBreachConsecutiveTurns: 3,
  },

  // ----------------------------------------------------------
  // City wealth dynamics (static parameters used by retail engine)
  // ----------------------------------------------------------
  cities: {
    wealthMin: 0.1,
    wealthMax: 0.9,
    /** Scales how much city wealthIndex reduces elasticity. Formula: 1 - (wealthIndex - 0.5) × factor. */
    wealthElasticityFactor: 0.3,
  },

  // ----------------------------------------------------------
  // City life system — population and wealth dynamics
  // ----------------------------------------------------------
  cityLife: {
    timeScale:           1.0,     // 1.0 = quarterly (reference speed); 1/3 = monthly, 4.0 = annual
    naturalDecayRate:    0.003,
    baseGrowthRateMean:  0.008,
    baseGrowthRateStd:   0.003,
    baseGrowthRateMin:   0.002,
    baseGrowthRateMax:   0.015,
    baseWealthRateMean: -0.000450,
    baseWealthRateStd:   0.000300,
    baseWealthRateMin:  -0.0006,
    baseWealthRateMax:   0.0004,
    wealthNoiseStd:      0.0008,
    populationNoiseStd:  0.008,
    networkBase:         0.5,
    networkScale:        0.3,
    networkMaxDistance:  500,
    networkMin:          0.3,
    networkMax:          2.0,
    // Population-density component: nearby large cities reduce remoteness
    // even without a direct road. Radius is in canvas px (canvas-size dependent).
    networkPopRadiusPx:  300,   // ~98km at default SCALE_FACTOR (2000×1400 canvas)
    networkPopNorm:      200_000, // reference population: 200k city = 1.0 unit
    networkPopScale:     0.05,  // contribution per pop-unit at zero distance
  },

  // ----------------------------------------------------------
  // Bankruptcy early warning
  // ----------------------------------------------------------
  bankruptcy: {
    warningThresholdTurns: 10,  // warn if < 10 turns of cash remain at current burn rate
    lookbackTurns: 10,          // turns of history used to estimate average burn rate
  },

} as const;

export type GameConfigType = typeof GameConfig;

// ============================================================
// Default map configuration — passed to buildCityNodes / buildMapLinks.
// All procedural parameters live here; future UI exposes these fields.
// ============================================================
export const defaultMapConfig: MapConfig = {
  nodeCount:          50,
  portCount:           3,
  mapType:         "trading",
  connectivity:     "normal",
  minimumDegree:         1,
  infrastructure:  "developed",
  difficulty:       "medium",
  canvasWidth:       2000,
  canvasHeight:      1400,
  portEdgeMargin:     120,
  highwayMaxDistance: 300,
};

// --- Named map presets ---
// Combine these with spread syntax to override individual fields.

/** Dense road network, advanced highways — feels like Western Europe / the Netherlands. */
export const europeanMapConfig: MapConfig = {
  ...defaultMapConfig,
  connectivity:    "dense",
  minimumDegree:       2,
  infrastructure:  "advanced",
  difficulty:      "easy",
};

/** Sparse roads, no highways — colonial or wild-west frontier territory. */
export const frontierMapConfig: MapConfig = {
  ...defaultMapConfig,
  mapType:        "frontier",
  connectivity:   "isolated",
  minimumDegree:       0,
  infrastructure: "undeveloped",
  difficulty:     "hard",
};

/** Moderate road network, basic highway spine — models a developing nation. */
export const developingMapConfig: MapConfig = {
  ...defaultMapConfig,
  connectivity:   "sparse",
  minimumDegree:       1,
  infrastructure: "basic",
};

/** Normal connectivity, developed highway network, industrial zone bias. */
export const industrialMapConfig: MapConfig = {
  ...defaultMapConfig,
  mapType:        "industrial",
  connectivity:   "normal",
  minimumDegree:       1,
  infrastructure: "developed",
};
