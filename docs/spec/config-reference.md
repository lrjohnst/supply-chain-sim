# PART 4: CONFIG FILE REFERENCE

```typescript
game: {
  turnsNormal: 200,
  quartersPerYear: 4
}

player: {
  startingCash: 100000
}

loans: {
  baseAnnualInterestRate: 0.06,
  minDurationTurns: 1,
  maxDurationTurns: 40,
  leverageRatio: 3,
  assetFloor: 15000
}

contracts: {
  breachFineAmount: 5000,
  volumeShortfallBreachThreshold: 50,
  qualityBreachConsecutiveTurns: 3,
  breachWarningIntervalTurns: 5,
  breachWarningQualityMargin: 0.1
}

tenders: {
  contractDurationTurns: 8,
  renewalGapTurns: 4,
  qualityDriftPerCycle: 0.02,
  volumeGrowthMean: 1.05,
  volumeGrowthStdDev: 0.1,
  incumbentNoticeTurns: 1
}

firmBaseOverhead: {
  factory: 500,
  farm: 200,
  store: 300,
  mine: 400
}

firmInvestmentSlotLimit: 8

investments: {
  productionLineStartupTurns: 2,
  startupCostFraction: 0.3,
  productionLineBaseQuality: 0.4,
  qualityGainPerTurnWithLab: 0.02,
  qualityGainFromTraining: 0.01,
  qualityDecayWithoutTraining: 0.005
}

training: {
  baseTrainingCostPerTurn: {
    farm: 200,
    factory: 400,
    store: 150,
    mine: 300
  },
  defaultCorporateIntensity: 50,
  qualityThreshold: 50
}

production: {
  recipes: {
    bauxite_to_alumina: { maxBatchSizePerTurn: 300, turnsPerBatch: 1 },
    alumina_to_aluminium: { maxBatchSizePerTurn: 150, turnsPerBatch: 2 },
    chicken_to_packaged: { maxBatchSizePerTurn: 200, turnsPerBatch: 1 },
    chicken_to_soup: { maxBatchSizePerTurn: 200, turnsPerBatch: 1 },
    laptop_branding: { maxBatchSizePerTurn: 100, turnsPerBatch: 1 }
  }
}

seasonal: {
  yieldMultiplier: [0.7, 1.2, 1.1, 0.8]
}

harborBasePrices: {
  bauxite: 31,
  ice_cream_strawberry: 1.80,
  laptop_whitelabel: 280,
  printer_branded: 85
}

retailBenchmarkPrices: {
  chicken: 8.50,
  chicken_soup: 4.20,
  ice_cream_strawberry: 3.20,
  laptop_branded: 450,
  printer_branded: 120
}

retailElasticity: {
  chicken: 0.5,
  chicken_soup: 0.6,
  ice_cream_strawberry: 0.6,
  laptop_branded: 0.4,
  printer_branded: 0.35
}

consumerDemand: {
  perCapitaDemand: {
    chicken: 0.0025,
    chicken_soup: 0.0015,
    ice_cream_strawberry: 0.004,
    laptop_branded: 0.00015,
    printer_branded: 0.00008
  },
  noiseStdDev: 0.02
}

salesRamp: {
  kSteepness: 0.30,
  midpointProgress: 7
}

harborPrices: {
  noiseStdDev: 0.01
}

commodityShockEvents: {
  checkFrequencyTurns: 4,
  probability: 0.25,
  normalizationMeanTurns: 8,
  normalizationStdDev: 3,
  kSteepness: 0.8,
  noiseStdDev: 0.015,
  shockMultiplierMin: 0.85,
  shockMultiplierMax: 1.35
}

recessionEvents: {
  checkFrequencyTurns: 8,
  probability: 0.15,
  cooldownTurns: 12,
  severityMin: 0.5,
  severityMax: 0.95,
  durationMin: 2,
  durationMax: 12,
  skew: 0,
  severityNoiseStdDev: 0.02
}

interestRateEvents: {
  checkFrequencyTurns: 6,
  probability: 0.2,
  deltaMin: -0.02,
  deltaMax: 0.03
}

tenderEvents: {
  checkFrequencyTurns: 8,
  probability: 0.2,
  minQuality: 0.4
}

bankruptcy: {
  lookbackTurns: 10,
  warningThresholdTurns: 10
}

winCondition: {
  netWorthThreshold: 5000000
}

map: {
  transportCostPerLink: 100,
  linkCapacityBase: 1000
}

cities: {
  wealthNoiseStdDev: 0.005,
  wealthMin: 0.1,
  wealthMax: 0.9
}

history: {
  rollingWindowTurns: 40,
  transactionRetentionTurns: 40
}

ai: {
  startingCityId: "city_b",
  debtToRevenueRatioLimit: 2.0,
  tenderMarginMinimum: 0.05,
  emergencyLoanAmount: 30000,
  firmEstablishmentCost: 10000
}

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
  enabled: true
}

spotPurchasePremium: 0.12
```
