# PART 2: CORE CONCEPTS GLOSSARY

**Corporation:** The player's holding entity. Owns all firms. Has consolidated books, a cash balance, loans, and a corporate training intensity setting.

**Firm:** The fundamental unit of the game. A farm, factory, or store. Has its own P&L, inventory, investments, production lines, and training intensity. Belongs to one corporation.

**Investment:** A firm-level improvement that takes turns to build and costs money each turn of construction. Generates operating cost when complete regardless of whether it is being used.

**Production line:** A factory investment that runs one specific recipe. Goes through states: queued → building → idle/unconfigured → starting up → active. Quality is tracked per production line, not per firm.

**Harbor:** A global supply bucket. Sells exactly four products: bauxite, strawberry ice cream, white-label laptops, branded printers. Never buys. All harbor purchases are spot price, no contracts. Prices fluctuate with noise and commodity shocks.

**Tender:** A competitive bidding event. Has a bidding window. Winner is awarded a delivery contract. Tenders cycle: when a contract expires naturally, a renewal tender posts automatically after a gap. Incumbents receive advance notice.

**Contract:** A bilateral delivery agreement between two corporations, or between a corporation and the market. Executes each turn: seller delivers, buyer pays. Has quality and volume breach conditions. Player can declare breach or continue when conditions are met.

**Market contract:** A contract where the buyer is the abstract market rather than a specific corporation. Goods disappear into the market on delivery. Revenue posts to the seller. Used for tender-awarded delivery obligations.

**Books:** The accounting system. Every ledger entry carries a full descriptor tuple: counterparty, product, quantity, unit price, total. Transaction categories: revenue, input_cost, overhead, operating_cost, training_cost, marketing_cost, capital_expenditure, loan_interest, loan_repayment, fine_payment. Books show completed turns only. Current in-progress turn never shown.

**Net worth:** Cash + firm asset values at cost + inventory at input cost − all liabilities. No depreciation in MVP. Used as the win condition metric.

**Ramp:** A per-product per-store value tracking market penetration. Follows a logistic S-curve (k=0.30, midpoint=7). Advances by units sold / fullRampDemand each turn. Resets to zero on stockout. Pauses when harbor purchases zero units due to low demand.

**Training intensity:** A per-firm value 0-100. Determines training cost and quality trajectory. Corporate slider sets default for all non-overridden firms. Per-firm override is independently settable. Quality improves when intensity ≥ qualityThreshold (default 50), decays below it.

**Chaos engine:** A logistic map (x → r·x·(1-x), r=3.82) driving permanent noise on harbor prices and consumer demand. Applied as the last step in all demand and price calculations.
