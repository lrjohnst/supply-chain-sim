## tenders.ts

**Confirmed behavior:**
- Tender lifecycle: open (bidding window) → awarded or expired
- Award spawns a delivery contract. No lump sum at award time
- Contract starts turn+1 after award. First delivery next turn
- Market tenders: lowest price wins. Sourcing tenders: highest price wins
- Quality checked against minQuality. Bids below threshold rejected
- publishedByFirmId on Tender: sourcing tender receives goods at specific firm
- Renewal cycle: when tender-spawned contract expires naturally OR market-buyer breach terminates, PendingTenderRenewal queued
- Renewal tender posts same turn contract expires (processRenewals called after executeContracts in tick sequence)
- Renewal volume: previous volume × growth factor drawn from normal distribution (mean 1.05, stdDev 0.1). Can go down
- Renewal quality threshold: previous + qualityDriftPerCycle
- Renewal price: recalculated from current market conditions
- Incumbent gets advance notice one turn before renewal posts
- Incumbent advance notice is always active for MVP. Post-MVP: business development unlock
- No persistent tenders. Starting tenders removed from newGame.ts. Debug panel spawn buttons are testing mechanism
- Bid quality snapshotted at submission time (post-MVP: re-evaluate at award)
- No inventory reservation on bids (post-MVP: deposits or reservation)
- withdrawTenderBid: removes all bids by corporation from open tender
- AI never submits tender bids (post-MVP: AI bids on industrial tenders)
- Eligible firms for bidding: must hold inventory of tendered product OR have active production line producing it

**Open questions:**
- Tender generation logic is placeholder in macroEvents.ts. Post-MVP: market-demand-driven generation
