## investments.ts

**Confirmed behavior:**
- Investment lifecycle: queued → in_progress → complete
- Cost spread evenly across build turns, one payment per turn
- Payment failure: investment pauses, notification fires, resumes when funds available
- Cancellation stops future payments, sunk cost lost, no refund
- Slot limit counts queued, in_progress, and complete investments
- not_built status removed
- Firm type validation in startInvestment: invalid investment types rejected at engine level
- Valid investment types per firm type driven by config
- Operating cost accrues on complete investments regardless of whether production line is configured or running
- Production line startup phase: separate from build phase. Player-initiated by configuring recipe
- productionLineStartupTurns: configurable in config
- Startup cost: baseTrainingCost × startupCostFraction per turn during startup
- Recipe change is queued until End Turn, cancellable until then
- Recipe change on active line restarts startup phase next turn
- End Turn gate fires when investment complete but unconfigured (production lines and store sections)
- Three gate options: Configure Now, Leave Idle (fires again next turn), Mark as Intentionally Idle

**Open questions:**
- None
