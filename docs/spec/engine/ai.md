## ai.ts

**Confirmed behavior:**
- Single AI corporation. First non-player non-eliminated corp found
- Exits immediately if eliminated
- Auto-sources ice cream for stores with completed grocery section
- Bids on market tenders where inventory or active production line exists for that product
- Bids at 97-100% of target price randomly. Minimum acceptable: unitCost × 1.05
- Expands into cities where player has presence but AI does not
- Debt-to-revenue ratio check before expansion: limit 2.0. Zero revenue uses 1.0 as divisor
- Firm build cost read from config
- Emergency loan parameters in config under ai block
- AI starting city from GameConfig.ai.startingCityId
- AI-expanded firms inherit AI corp's corporateTrainingIntensity
- AI never sources from player firms (post-MVP)
- AI never writes contracts (post-MVP)
- AI never bids on sourcing tenders (post-MVP)

**Open questions:**
- AI only builds stores. Never factories or farms. Cannot participate in industrial supply chains
