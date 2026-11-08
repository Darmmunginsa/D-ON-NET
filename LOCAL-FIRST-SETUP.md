# SalePro Local-first, phase 1

New quote Drafts commit to IndexedDB before showing success. Draft creation and edits persist only when the user clicks Save Draft (or explicitly submits for approval). Opening a new quote, typing, rendering items, switching accounts and logging out do not create or update Draft records automatically. The drawer combines local Drafts with existing server Drafts. Catalog and Customer Profile are warm-start read caches; their writes remain online. Existing server quotation edits, approvals, numbering, payments and deletion continue online.

Storage is partitioned by backend URL and signed-in email. Tokens are never stored in IndexedDB. Login still requires the existing Google authentication. The app has no offline login or service-worker installation in this phase. Browser storage is a working copy, not an independent permanent backup.

## Sync

- `SaleDrafts` stores the current snapshot or conflicting branches, separate from Quotations. Pending local edits coalesce. Sync is retried on reconnection, every 45 seconds and by clicking the Draft status button.
- `localDraftSync` returns only the signed-in actor's records changed since a durable cursor. The server and browser discard superseded working snapshots; they do not retain a complete historical audit archive.
- Same-account edits on different devices retain conflicting branches. Opening a branch asks which version to use. Saving explicitly resolves the branches. The system blocks submission until the selected Draft is synced and conflict-free.
- `SaleDraftReceipts` prevents a lost response or delayed retry from resurrecting an obsolete snapshot. Script locks serialize server writes. Snapshot cells are chunked below the Sheets cell-size limit, without splitting Unicode surrogate pairs.
- A submitted Draft links to an online Quotation through LocalDraftId. The server atomically reuses an existing header if another tab already submitted it. It does not automatically replay approval submissions, payments or email actions.

## Deploy

The combined backend at `salepro/apps-script/SalePro-AppsScript-FULL.gs` preserves the supplied Desktop/new.txt changes (including mail CC), the latest repo's numbering helper, all service/contract modules and LocalDraftSync. Paste that combined file into the existing single-file Code.gs project, Save, and deploy a New version of the existing deployment. Do not additionally paste its modules into the same project. Keep the existing URL, database, Script Properties and trigger settings. Do not run database initialization.

The two new tabs are created automatically on first use. No Cloudflare Worker update is needed. Until the new backend is deployed, local Drafts remain queued and their submission is blocked with an update message. Existing numbered quote flows stay online.

## Verification

Unit tests cover offline recovery, failed writes, lost responses, stale acknowledgements, delta cursors, coalescing, account isolation, concurrent branches and server idempotence. The browser fixture uses real IndexedDB with fake network/backend data; no live business records or emails are written during verification.
