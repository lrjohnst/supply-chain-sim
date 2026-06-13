## operatingCosts.ts

**Confirmed behavior:**
- Deduction order: firm base overhead → firm investment operating costs → startup commissioning costs → training costs → marketing budget
- Firm base overhead: flat per-turn cost per firm type from game start regardless of investments. Config: firmBaseOverhead per type
- Training cost: baseTrainingCostPerTurn[firmType] × (trainingIntensity / 100). Posted as firm-level training_cost transaction
- Marketing: single corporate-level marketing_cost transaction
- Quality per production line, not per firm
- Quality improves if trainingIntensity ≥ qualityThreshold (default 50). Decays below
- Quality lab and training stack additively in same turn
- Stores excluded from quality mechanics entirely (post-MVP: store quality affects customer satisfaction)
- AI eliminated on first operating cost shortfall, no grace period, notification fires to player
- starting_up production lines pay startupCostFraction of normal operating cost per turn

**Open questions:**
- None
