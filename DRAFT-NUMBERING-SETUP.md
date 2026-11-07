# Draft basket and approval numbering

New Drafts and pending submissions keep `Title` blank. The record UUID continues to link all line items, metadata, projects and approvals. Existing numbered records retain their numbers. Drafts are listed in the top drawer and omitted from the default quotations list (the explicit Draft status filter still works).

The server allocates `<Sale initials><NN>-<MM>-<YYYY>` only when the record becomes Approved. Existing monthly numbers, including revisions, seed the counter. Script Properties retain the monthly high-water mark. Allocation and row update use the same script lock. A retry against the same row reuses the issued number. An interrupted write can leave a sequence gap; numbers are never reused.

## Apps Script deployment required

1. In the existing admin@dongroups.com Apps Script project, update Code.gs from `salepro/apps-script/Code.gs` and add QuotationNumbering.gs from `salepro/apps-script/QuotationNumbering.gs`. Preserve existing ServicePlan.gs, ServiceAutomation.gs, ContractNumbering.gs and Script Properties.
2. Alternatively, the locally prepared `outputs/draft-numbering-release/Code.gs` combines the updated Code.gs and QuotationNumbering.gs for one paste into Code.gs. If using that combined file, do not also add QuotationNumbering.gs.
3. Deploy → Manage deployments → Edit the existing deployment → New version → Deploy. Keep Execute as admin@dongroups.com and the existing access settings and URL. No trigger or database reset is required.
4. Reload SalePro. New Drafts remain unnumbered until approval. The client checks `serviceCapabilities.quotationNumbering` before approving an unnumbered record, so it cannot silently mark it Approved with no number on an older backend.

No live records are migrated or deleted. Automated tests and the browser preview use fixtures; no test email is sent.
