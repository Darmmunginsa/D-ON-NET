# Automatic contract numbers

Prepared locally; do not publish the new frontend before the Apps Script update is deployed.

- Server-issued `contractNo`: DN-CT-YYYY-0001, Bangkok calendar year, persistent yearly counter in Script Properties.
- Existing numbers remain unchanged on update. All create, batch-create and update paths reserve numbers while holding the existing script lock. Reservations can leave gaps after failed writes and are not recycled.
- Authenticated `ensureContractNumbers` backfills missing numbers only. Row IDs, service agreements, terms, visits, PO and customer fields remain intact. Invalid JSON aborts rather than silently replacing data.
- Contract list displays and searches contractNo. PDF reads contractNo only and requires saving before printing.
- New frontend checks the backend capability before using numbering. Existing deployed frontend continues to work during the backend update.

## Owner deployment

The release file `outputs/contract-numbering-release/DONNET-Contract-Numbering-Code.txt` combines Code.gs, ServicePlan.gs, ServiceAutomation.gs and ContractNumbering.gs, matching the previous all-in-one installation. Back up the existing editor source, replace the all-in-one Code.gs, save, then update the EXISTING deployment to a new version. Preserve URL, Script Properties and trigger settings. If the project now uses separate helper files, use the separate repository sources rather than introducing duplicate definitions.

No database initialization and no reminder installer rerun are needed. No email is sent by number assignment.

After the owner confirms deployment: verify the authenticated capability, publish frontend, open Contracts to backfill numbers and validate search/PDF against an owner-approved record. Direct Apps Script access was previously rejected by approval review; do not bypass that restriction through other tools.

## Local verification

37 focused tests pass, covering sequence reservation, existing maximum, immutable numbering, repeatable backfill, unaffected non-contract lists, tracker import, agreement rendering, terms, schedules and reminders. Combined Apps Script release compiles. Live numbering has not yet been verified.
