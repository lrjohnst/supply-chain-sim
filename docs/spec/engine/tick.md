## tick.ts

**Confirmed behavior:**
- Single synchronous function transitioning game state from turn N to N+1
- Sequence: fire macro events → tick harbor prices → advance investments → production → execute contracts → process renewals → evaluate tenders → harbor spot purchases → retail sales → process loans → deduct operating costs → update quality → tick cities → check contract risks → AI decisions → generate macro events → append economic snapshot → check win condition → advance turn counter
- Player has no input during execution
- Nothing happens mid-turn
- Win condition check before macro event generation. If game over, turn counter does not increment
- winCondition.ts reports only, never sets phase directly
- Phase set to won only when player confirms end game
- pendingWin removed. justWon flag in tick result triggers store to show win screen

**Open questions:**
- None
