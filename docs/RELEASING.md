# Releasing Scrim

Scrim updates itself from GitHub Releases. Installed copies look for a new version about 12 seconds
after start and every 4 hours, download it quietly, then show a "Restart now" card. If the person
ignores it, the update installs the next time they quit.

## Ship a new version

1. Bump `version` in `package.json` (for example `0.3.0` to `0.4.0`). The updater compares versions,
   so every release needs a higher one. A version like `0.4.0-beta.1` is only offered to people
   already on a beta.
2. Make a GitHub token with `repo` access and set it for this terminal:
   `set GH_TOKEN=ghp_...` (cmd) or `$env:GH_TOKEN="ghp_..."` (PowerShell).
3. Run `npm run release`. This builds the installer and uploads `Scrim-Setup-x.y.z.exe`,
   its `.blockmap` and `latest.yml` to a release on github.com/Alphred-OB/Scrim.
4. Open the release on GitHub, write the notes (the first line shows on the update card) and publish it.
   Installed apps only see published releases, not drafts.

`npm run dist` still builds an installer locally without uploading anything.

## Code signing (removes "Unknown Publisher")

Windows shows "Unknown Publisher" for unsigned installers. You need a code signing certificate
in the company's name; it can't be generated here. Two ways:

**A. A certificate file (.pfx)** from a certificate authority (Sectigo, DigiCert, SSL.com, Certum...).
Before `npm run release`, set:

```
set CSC_LINK=C:\path\to\scrim-cert.pfx
set CSC_KEY_PASSWORD=your-pfx-password
```

Note: most new certificates now come on a hardware token or a cloud HSM instead of a .pfx.
For those, follow the vendor's signtool instructions, or use option B.

**B. Azure Trusted Signing** (cheap monthly plan, no USB token, works from CI). Fill in the
commented `azureSignOptions` block in `electron-builder.yml` and set `AZURE_TENANT_ID`,
`AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.

After the first signed release, uncomment `publisherName` in `electron-builder.yml` with the exact
name on the certificate. From then on the updater refuses any installer not signed by you.

SmartScreen can still warn for a little while on a brand new certificate until enough people have
installed the signed app; that goes away by itself as it builds reputation.
