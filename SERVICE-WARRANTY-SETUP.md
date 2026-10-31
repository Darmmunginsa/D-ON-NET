# Service Agreement / MA-PM / warranty lookup

## Current status

Apps Script was installed and deployed by the owner. Dry run: jobs 0, emailsSent 0, enabled false. The existing Cloudflare Worker was deployed on 2026-10-31 with native WARRANTY_RATE_LIMITER (6/60s), preserving variables and secrets. Live checks: internal API 401 without login; unknown public Serial 200 with found false. Frontend rollout is enabled in this release. Daily trigger activation still requires the owner to run installServiceReminderTrigger in Apps Script; no test emails were sent.

The owner provided the specific Apps Script editor:
`https://script.google.com/u/1/home/projects/1dOb6bsigdtQp7X0xfVM8ivZqgCrb7mHEPJtUc2LtFJmgNkNVAqjze6Fh/edit`

Automatic approval review rejected the browser action because it requested authority through Google Drive beyond the named Apps Script project. No alternate browser/account/API access was attempted.

## Implemented behavior

- SalePro Contracts: optional MA/PM plan tied to selected existing quotes/PO references. Choose 2/4 annual intervals with a first calendar month, or add individual months. Every visit has an ID, month, optional appointment, status, actual completion date, staff note, and optional work report attachment.
- Regenerating retains matching visit IDs and completion history. Removing visits with existing details asks before discarding them. Duplicate months, impossible dates, outside-contract appointments, and completed visits without actual dates are rejected. Late completion can be recorded without falsifying the contract end date.
- One equipment model and Serial per line. A button reads equipment/Warranty expiry rows from selected quotes; no imaginary Serial Numbers are generated.
- Service Agreement uses the actual model/Serial, PO, customer address, contract period, selected months and editable per-contract terms. It supports a draft/final label selection, with blank signature lines; the former provider's terms, logo and signatures are not reused. For final-label output, equipment, customer address and terms must be filled. Browser Print saves an A4 PDF. Long documents can span pages.
- Visit uploads are PDF/JPEG/PNG/WebP up to 4 MB. The client first requires the backend `privateVisitUploads` capability and sends `privateFile:true`. Updated backend does not grant anyone-with-link sharing for these files. Actual access still inherits the upload folder's permissions. Existing file upload behavior outside this feature is retained.
- Expiry rows have an explicit public-search checkbox. Only equipment or Warranty rows with a valid, unique Serial, one unit and valid start/end dates can yield a public record. License, staff notes, names, addresses, email, amounts, PO and attachments never form part of the public response.
- Duplicate published registrations for a Serial return a neutral not-found/contact-staff result; the lookup never guesses between conflicting dates.
- Public web no longer downloads the complete Google Sheets customer dataset. It POSTs a Serial to the Worker `/warranty` endpoint and renders only its small public projection.
- Public query endpoint requires approved origins and a Cloudflare native rate limiter; missing configuration fails closed. This is an unauthenticated exact-Serial lookup of opted-in warranty metadata, not a login to internal Sales APIs. Origin checks alone are not treated as authentication. Rate limits are approximate per Cloudflare location.
- Staff recipients are restricted to the configured allowed accounts: admin@dongroups.com, darm.m@dongroups.com, jongrak.k@dongroups.com. Customers are never notification recipients for this feature.

## Daily reminders

`runServiceRemindersDaily` builds staff notifications for equipment/Warranty/License expiry, contract end, and MA/PM visits. It distinguishes advance reminders from due/overdue reminders. Completed/cancelled visits and renewed items are omitted. For a month-only visit with no appointment, the deadline is the month's last day clipped to contract end; the message explicitly says an appointment has not been confirmed.

`ServiceReminderLog` records a SHA-256-derived key per event/date/phase/recipient. A script lock prevents concurrent claiming. A `sending` claim is persisted before MailApp is invoked. `sent` entries are skipped on subsequent runs. If sending or recording the outcome is uncertain, the claim is retained and not automatically retried. Staff must reconcile uncertain deliveries before deliberately resending. This prevents automatic duplicates at the expense of requiring review after an uncertain failure; it is not a guarantee of exactly-once email delivery.

Quota exhaustion does not claim a delivery. A run handles at most 40 sends. No automatic customer messages are sent.

## Installation order — preserve existing code and settings

1. Open the **named Apps Script project only**, as `admin@dongroups.com`. Read/diff and back up its current source before applying changes; the repo copy may not contain later editor-only customizations. Do not overwrite unknown changes with the reference file.
2. Add `ServicePlan.gs` and `ServiceAutomation.gs` from `salepro/apps-script/`. These files contain no secret values.
3. Apply the small changes shown in the Code.gs patch, preserving the rest of the project:
   - In `doPost`, before `_authorizeGateway(req)`, handle only `req.action==='publicWarrantyLookup'` through `lookupPublicWarranty(req)`; that function checks the existing gateway secret and owner itself.
   - `handle(req)` adds authenticated `serviceCapabilities` returning version 1 and `privateVisitUploads:true`.
   - `createRow`/`updateRow` invoke `validateServiceFields` before writes.
   - In `uploadFile`, grant anyone-with-link sharing only when `req.privateFile!==true`.
4. Preserve `SPREADSHEET_ID`, `UPLOAD_FOLDER_ID`, `GATEWAY_SECRET`, `ALLOWED_EMAILS` and all existing script properties. Do not put secrets in source, GitHub, URLs, screenshots or chat.
5. Run **serviceAutomationDryRun**. This logs counts and sends **zero emails**. Check the count before enabling daily scheduling. Do not run the database initializer; existing data must remain intact.
6. Update the existing deployment to the new version, still executing as admin. Preserve its deployment URL if possible. If a new URL is required, update only the Worker's `APPS_SCRIPT_URL` variable accordingly.
7. Update the existing Cloudflare gateway with the reviewed changes from `infrastructure/gateway.mjs`; compare against its current code first. Existing Google JWT authentication remains unchanged on other routes. Preserve existing variables and secrets.
8. Add a native Rate Limiting binding named `WARRANTY_RATE_LIMITER`, with a fresh namespace, limit 6 per 60 seconds. The equivalent additional Wrangler configuration is:

```json
{"ratelimits":[{"name":"WARRANTY_RATE_LIMITER","namespace_id":"20261031","simple":{"limit":6,"period":60}}]}
```

Use a namespace not already shared with other limiters in the owner's account. Optional `PUBLIC_WARRANTY_ORIGINS` defaults to `https://www.dongroups.com,https://dongroups.com`. Keep the internal app's existing `ALLOWED_ORIGINS` unchanged.

9. Verify an unauthenticated internal API call still gets 401, a direct backend lookup without the shared secret is denied, a valid unknown Serial returns a neutral not-found, and a known opted-in test record returns only four public fields. Use owner-approved test records and avoid real customer data in logs.
10. Publish the D-ON-NET frontend only after the backend capabilities are confirmed. For the website, switch `warranty-config.js` from `enabled:false` to `true` only after the Worker route is ready, then publish the Dongroups changes. It is intentionally disabled in the prepared source to prevent a premature cutover.
11. To activate the daily reminder, run **installServiceReminderTrigger** as admin after reviewing the dry-run count. The installer creates a daily Asia/Bangkok trigger in the 09:00 hour (not an exact appointment time), enables reminders, and writes `ServiceReminderMode=server` in Settings. It does not itself send an email. Reload open SalePro sessions so old browser-based expiry/contract reminder checks see the server-mode flag and stop.

## Verification completed locally

- 32 focused tests passed: 16 schedule/backend/projection/idempotence cases, 6 public-route security cases, 10 existing authenticated gateway/JWT regression cases.
- Dongroups static and warranty tests: 10 passed, including no legacy bulk Sheet download, output escaping, no private fields, unconfirmed response handling and a disabled rollout that makes no network request.
- JavaScript/Apps Script syntax and local asset links checked.
- Browser preview used demo customer/Serial values only. The frequency selector changed from 2 to 4 and the generated months updated while retaining the matching existing visits.
- Service Agreement renderer inspected visually as a complete page with customer/equipment table, editable terms, month grid and unsigned signature area.
- The complete D-ON-NET suite still contains one pre-existing failing PurchasePro mail retry test, unrelated to this change; no claim is made that all repository tests pass.
- Actual production login, persisted records, email delivery, Drive permissions and scheduled runs have not been exercised for this feature yet. Actual print-to-PDF pagination still needs review on the target browser/printer for long terms and many equipment rows.

## Local review artifacts

- UI demo: http://127.0.0.1:4319/
- Document demo: http://127.0.0.1:4319/agreement.html
- Source bundle: `C:/Chat GPT/D ON NET/outputs/service-warranty-release`
- Screenshot: `C:/Chat GPT/D ON NET/outputs/service-agreement-preview-full.jpg`

The source reference PDF was read locally only and is not copied into Git, the public website or the deployment bundle. All preview equipment and customer data are marked DEMO/SAMPLE.

Rate limiter reference: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
