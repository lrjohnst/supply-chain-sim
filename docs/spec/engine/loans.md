## loans.ts

**Confirmed behavior:**
- Variable rate loans: interest rate changes apply delta to all active loans including existing ones
- Quarterly payment recalculates each turn from current annualInterestRate, remaining balance, remaining turns
- quarterlyPayment on Loan stored as display value only (payment at origination)
- Loan max: max(totalAssets, assetFloor) × leverageRatio. assetFloor €15k, leverageRatio 3x (configurable)
- Paid-off loans removed from state and corp.loanIds when balance < €0.01
- New loans use currentBaseInterestRate from GameState
- loan_interest hits P&L. loan_repayment is balance sheet only, excluded from net profit
- Fine deduction in breach uses requireCash for player, eliminateCorporation for AI

**Open questions:**
- Loan repayment notification not implemented
