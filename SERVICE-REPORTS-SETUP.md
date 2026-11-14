
# Electronic service reports

## Deployment order
1. Back up the current Apps Script source. Replace Code.gs using SalePro-AppsScript-FULL.gs from this release, then update the existing web-app deployment to a new version. Keep the current URL, admin@dongroups.com execution account and existing Script Properties. Do not add the standalone source files alongside the FULL bundle (duplicate functions).
2. Deploy infrastructure/gateway.mjs to the existing d-on-net-gateway Worker, retaining its existing variables, secrets and WARRANTY_RATE_LIMITER binding.
3. Publish Tech assets from D-ON-NET and the Warranty/report assets from Dongroups. A Git push alone does not deploy Apps Script or the Worker.

## User flow
- Tech: open an assigned job → Report → General Job Sheet or Service Record.
- Fill data, select existing job photos, save Draft, draw the engineer signature, then confirm signing. Signed reports receive a unique DN-SR-year-sequence number and cannot be overwritten. Use a new correction revision for changes.
- Admin can configure company, logo, report titles, footer, website and telephone. Branding is stored with each report; existing signed copies keep their original branding.
- Publish is a separate explicit action. The exact Serial must already have an eligible published Warranty record. Warranty lookup then lists signed, published reports for that Serial. Unpublish removes public access.
- The public copy omits contact name, telephone, site address and the customer acknowledgment signature. Report free text and selected photos are public when published; staff must review the customer preview before publishing.
- Signature capture records the verified staff identity and timestamp; it is not a certificate-based digital signature.

## Verification
Automated tests cover draft/sign/version checks, immutable signed reports, Warranty publication eligibility, escaping and public-field redaction. Browser/printed-page verification is still pending because Computer Use could not establish the Chrome URL. No production report data has been created by this implementation.

## Partner and protected customer access update (2026-11-15)
- Admin manages Partner profiles in Tech Report settings. Drafts can switch company; signed copies retain their original branding snapshot.
- Tech sets a per-report password (12–128 characters; random generator available), then publishes with an access period of 1–365 days (default 7). Share the password separately with the customer. Passwords are salted, peppered HMAC hashes; preserve REPORT_PASSWORD_PEPPER in Script Properties when backing up or migrating.
- Customer report access requires the password and an unexpired publication. Customers may withdraw public access early after unlocking. This only changes publication metadata; Tech's signed original remains stored.
- Existing published reports without an expiry/password must be configured and published again. The updated Worker rejects report payloads from older backends lacking access validation.
- Downloaded files and previously shared Drive photo URLs cannot be revoked by this report-page access control.
- Deploy the updated FULL Apps Script bundle and Worker. Git pushes publish frontend files only; Apps Script must be updated separately.
