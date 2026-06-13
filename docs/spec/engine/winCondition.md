## winCondition.ts

**Confirmed behavior:**
- Checks all corporations each turn
- Player checked first: simultaneous win goes to player
- Win: net worth ≥ configured threshold
- Loss: bankruptcy (cash insufficient for obligation) or time limit (turn ≥ 200)
- Bankruptcy during Keep Playing is still a loss
- AI winning ends game immediately with loss screen for player
- AI bankruptcy eliminates AI, game continues without them
- reason field on result: "won", "loss_bankruptcy", "loss_time_limit", "loss_ai_won"

**Open questions:**
- None
