# Contributing to HESARI OS

HESARI OS is an open-source configuration panel based on BPB Worker Panel. Keep
the networking behavior and existing client formats compatible when changing UI
or branding. Preserve original credits and GPL-3.0 licensing.

Use Node.js 22 or later and install the locked dependencies:

```sh
npm ci
npm run check
npm test
```

`npm test` builds the release Worker and runs branding checks and integration
tests in Cloudflare's local runtime. Tests use isolated KV and mock external
providers; they never deploy a Worker or require your Cloudflare credentials.

For interactive development, copy `settings.example.json` to
`.local/settings.json`, enter your own account settings, and run `npm run dev`.
This runs the actual Worker with persistent local KV. Calls to external services
such as DNS, Cloudflare account management and WARP use the real APIs. Changes to
embedded main settings can redeploy the Worker named by `mainDomain`, just as
they do in BPB, so use a dedicated development Worker/account configuration.

Before opening a pull request, explain the user-visible change and the checks
you ran. Include regression coverage when changing configuration generation,
authentication, deployment or persistence. Do not include `.local/`, `.env`
files, account tokens, private subscription paths or configured Worker bundles.

The project repository is https://github.com/mjhesari/Hesari-Os. Report
reproducible bugs there, including client/core versions and redacted logs.

GitHub Actions is intentionally inactive. Optional workflows are kept under
`automation/github-actions/`; they do not execute from that directory. Enable
them later only by explicitly moving them to `.github/workflows/`.
