## books.ts

**Confirmed behavior:**
- Pure read, no mutations. Called on demand by UI
- Transaction categories in computeFirmBooks: revenue, input_cost, overhead, operating_cost, training_cost, transport_cost, startup_cost, capital_expenditure. All explicitly handled
- marketing_cost and loan categories at corporate level only
- loan_repayment excluded from P&L (balance sheet item)
- loan_interest included as P&L expense at corporate level
- Zero-total transactions skipped in bucketing, included in raw lines
- Internal transfers excluded from consolidated P&L to avoid double-counting
- Net worth always reflects current state regardless of which historical turn is viewed. UI note shown
- Books screen shows completed turns only. Default previous turn. Current turn never shown
- Turn selector for browsing history

**Open questions:**
- Post-MVP: net worth should be read from EconomicHistory for selected turn
