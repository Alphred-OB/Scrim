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
4. Open the release on GitHub, write the notes and publish it. Write them as short plain lines, one change each (a `- ` list is fine, up to 6 lines): they become the "What's new" list on the update screen, and the first line is the corner card's text.
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

## Crash reports and feedback

Both are off until you fill in `src/shared/config.ts`, then build a new version.

**Feedback ("Report a problem", "Suggest a feature")** goes to the small service in
`server/feedback`. Put it online with Render (see `server/feedback/README.md`), give it your own
domain, and set `FEEDBACK_URL` to that address. Reports land in the dashboard at `/admin`.
If someone is offline, the report waits on their PC and is sent the next time Scrim starts.

**Crash reports** go to Sentry, and only for people who said yes (Scrim asks once, and it's in
Settings, General, Privacy and help).

1. Make a free account at sentry.io and a project of type **Electron**.
2. Copy the project's DSN into `SENTRY_DSN`.
3. In the project settings, under Security and Privacy, turn on "Prevent Storing of IP Addresses".

Scrim already removes the user's name, home folder, computer name and API keys from every report,
and never sends videos, pictures or files with a crash.
