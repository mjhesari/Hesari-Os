# Security policy

Report vulnerabilities privately to the maintainer through
https://github.com/mjhesari/Hesari-Os/security/advisories/new. If private
reporting is unavailable, use the contact options at https://mj-hesari.ir.
Do not post account tokens, passwords, private paths or live subscription links
in public issues.

The public release artifact is `dist/worker.js`; it contains no installation
credentials. The configured `.local/worker.js` and `.local/settings.json`
contain your Cloudflare account settings and API token. Keep these files private.
Use a dedicated API token restricted to the account and resources your panel
needs. Revoke exposed credentials through Cloudflare and replace affected
panel passwords and subscription credentials.

Changes to main settings, panel updates, domain management, and panel deletion
use Cloudflare's management APIs under the configured account. Grant only the
permissions needed for the functions you use. When upgrading an existing panel,
retain its KV binding and embedded settings unless intentionally migrating.
