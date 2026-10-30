# Finance tax fields

Manual receipt/payment entries support independent VAT (0/7%) and withholding (0/1/3/5%) selections. The entered amount can include or exclude VAT. Withholding is calculated on the entire base before VAT. Split transactions if only part of an invoice is subject to withholding. The operator chooses the appropriate rate for the transaction.

`FinanceTx.Amount` remains actual net cash, preserving existing dashboards. New entries store `TaxVersion=1`, `InputAmount`, `TaxMode`, `BaseAmount`, `VatRate`, `VatAmount`, `WhtRate`, `WhtAmount`, `GrossAmount`, `TaxDate`, `TaxDoc`, `VatEligible`, and counterparty snapshots. Editing restores the entered amount, avoiding repeated deduction of withholding.

VAT reports use the invoice date; withholding reports use the receipt/payment date. Input VAT credit requires an explicit checkbox. The VAT difference excludes brought-forward credits and adjustments. Withholding payable and withholding credits are reported separately, including breakdowns by rate. Reports are operational summaries, not filed tax returns.

Legacy entries, reimbursements, and imported SalePro/PurchasePro transactions have no reliable complete tax snapshot and are explicitly excluded from tax totals. A count is shown. Do not duplicate imported cash transactions to include their taxes. Integration of their document-level tax data is separate work.

The new `FinanceParty` sheet is created by the existing generic backend when accessed. Records can be added/edited from the sidebar. Selecting one copies its name, tax ID, and branch into the transaction. Subsequent changes to a party do not rewrite historical transactions.

No old records are migrated or recalculated. No backend deployment or mail test is required for this change.

References: https://www.rd.go.th/5206.html and https://rd.go.th/3479.html
