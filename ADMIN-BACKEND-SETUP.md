# New empty database owned by admin@dongroups.com

## Runtime components

- Database: `1HkB3y5gXPp2cLn4YmDAddMGfnqQtPmJJDZ_RKLS84DU`
- Attachments folder: `1Ra1XkkAbXpmo5uCbYOyxyvLSvjxaU1rw`
- Frontend API endpoint: `https://d-on-net-gateway.darmmunginsa.workers.dev/`
- Worker validates Google ID token signatures, audience, issuer, expiry, verified Workspace email and explicit email allowlist.
- Worker sends the verified actor and a server-only secret to Apps Script. The browser never receives this secret.
- Apps Script checks the secret and the actor allowlist before any API action, and verifies it executes as `admin@dongroups.com`.
- Outgoing MailApp messages are sent by the deployment account `admin@dongroups.com`; Reply-To is the authenticated operator.

The Worker source is maintained separately from GitHub Pages. No secret values belong in this repository. Store the same `GATEWAY_SECRET` in the Worker secret and Apps Script Script properties. Both also have `ALLOWED_EMAILS` configured by the owner.

## Fresh start behavior

No records are imported from the old Sheet or folder. Browser data is namespaced by the new database ID, including sales profiles, signature caches and pending basket writes. Old storage is preserved but ignored. Existing local user profiles no longer grant access: all apps need a current Google ID token, held in session storage only. Expired/rejected sessions require Google sign-in again.

Only `admin@dongroups.com` is bootstrapped as administrator in the new frontend/database. Other approved accounts can sign in if configured in both backend allowlists; business roles remain configured in Settings.

No automatic API retries are performed after uncertain network failures; check server state before repeating a write or sending mail again.

## Before cutover

1. Confirm the Apps Script uses this Code.gs, latest deployment, executes as admin, and checks `_authorizeGateway(req)` in doPost.
2. Confirm a direct request without the server secret returns Unauthorized gateway.
3. Confirm a gateway request without Google authentication returns 401.
4. Sign in to the staged/current frontend as admin. If Google OAuth is in testing mode, ensure the company accounts are permitted in that OAuth project and the GitHub Pages origin is authorized.
5. Read the initialized Settings, create one permitted test record, reopen the page and confirm it persists in the new Sheet only.
6. Test email only to an explicitly approved recipient and verify From/Reply-To in the received message. Do not assume mocked tests prove actual delivery.
7. Check file upload and open permissions with the company accounts. The original upload implementation grants anyone-with-link access to uploaded files; the gateway does not change that existing sharing behavior.

The previous database, folder and deployment remain intact. Reverting frontend configuration/code to the prior release restores the old environment; it does not merge data between databases.
