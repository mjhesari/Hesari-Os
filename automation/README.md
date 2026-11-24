# Optional GitHub Actions templates

These files are inactive templates. No files are installed in `.github/workflows/`.
The public repository starts with independent HESARI OS history; the complete
previous local history is preserved in the checkout’s `bpb-history` branch.

To enable automation later, explicitly copy the desired files from
`github-actions/` into `.github/workflows/` and authorize your GitHub client for
workflow changes. Until then use `npm run check`, `npm test`, `npm run build`
and `npm run docs:brand` locally. Publish only the credential-free files in
`dist/`; never upload `.local/`.
