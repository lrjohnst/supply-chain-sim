## contracts.ts

**Confirmed behavior:**
- Three contract types by buyer: harbor (seller delivers to harbor buyer), market (seller delivers to abstract market), firm-to-firm (between two corporations)
- No harbor contracts exist. Harbor purchases are spot only
- Internal contracts (same corporation): cash moves between firms at transfer price set by selling firm. Player can micromanage per-firm profitability
- Partial delivery: deliver available inventory, notify, do not auto-breach
- Zero inventory delivery: notify separately from partial delivery
- Quality tracked per production line, not per firm
- Breach conditions: cumulativeVolumeShortfall threshold OR consecutiveQualityFailureTurns threshold
- When breach conditions met: player harmed → End Turn gate fires (Declare Breach / Continue Contract). AI harmed → auto-breach immediately
- Market-buyer quality breach: auto-terminate after qualityBreachConsecutiveTurns. Triggers renewal cycle
- Market-buyer volume breach: auto-terminate when threshold crossed. Triggers renewal cycle. Notification: market has found another supplier
- Fine on breach: breachFineAmount from config, posted as fine_payment on both sides. Uses requireCash for player seller, eliminateCorporation for AI seller
- Advance notice: incumbent corporation notified one turn before renewal tender posts
- Renewal scheduled on natural completion and on market-buyer breach/quality-terminate
- checkContractRisks: inventory warning and quality warning fire every N turns (breachWarningIntervalTurns) while risk persists. Stable notification ID per contract, does not stack
- originType and originId on Contract: extensible origin system (tender / direct / sourcing / null)
- multiYearContractsUnlocked required for contracts longer than 2 turns (skippable for tender-spawned contracts)
- checkMilestones called in market and firm-to-firm revenue branches

**Open questions:**
- Market-buyer fine: no fine paid on market breach (no counterparty). Known gap
