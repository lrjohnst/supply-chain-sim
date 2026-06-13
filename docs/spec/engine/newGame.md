## newGame.ts

**Confirmed behavior:**
- Pure assembler. Imports from map.ts and city.ts for spatial data
- Player and AI start with identical cash: GameConfig.player.startingCash (€100k)
- AI seeded in GameConfig.ai.startingCityId (city_b)
- No starting tenders seeded
- pendingTenderRenewals initialized empty
- currentBaseInterestRate initialized from config
- makeFirm factory: trainingIntensity defaults to corporateTrainingIntensity, trainingIntensityOverridden: false

**Open questions:**
- Post-MVP: setup phase for choosing starting conditions, difficulty, corporation identity
