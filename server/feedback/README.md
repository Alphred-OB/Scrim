# Scrim website and feedback service

One small Node app that does three things:

- **The website** (`public/`): home page, `/feedback` (report a problem or suggest a feature) and `/privacy`.
  `/download` always sends people to the newest Windows installer on GitHub Releases.
- **Feedback** from the app and the website, stored in Postgres.
- **A dashboard** at `/admin` to read and sort it. Crash reports go to Sentry, not here.

## Put it online (Render, about 5 minutes)

1. Push this repo to GitHub.
2. In Render: **New > Blueprint**, pick the repo. It reads `render.yaml` and makes the service and a Postgres database.
3. When asked, set `ADMIN_PASSWORD` (your dashboard password). `NOTIFY_WEBHOOK_URL` is optional: paste a Discord or Slack webhook to get a message for every new report.
4. Your own domain: in the service's **Settings > Custom Domains**, add e.g. `feedback.eruditeafricannetwork.com`, then add the CNAME record Render shows you in Cloudflare (DNS only, grey cloud, until Render has issued the certificate).
5. Put the address in the app: `src/shared/config.ts`, `FEEDBACK_URL`.
6. Downloads: `GITHUB_REPO` (default `Alphred-OB/Scrim`) must have a published release with the `.exe`.
   The repo has to be public for visitors to download it. `GITHUB_TOKEN` is optional and only raises GitHub's rate limit.

Since the site and the feedback live together, one domain covers both, for example `scrim.eruditeafricannetwork.com`.

Note: Render's free database is deleted after 30 days on the free plan; switch it to the cheapest paid plan (or point `DATABASE_URL` at a free Neon database) for anything you want to keep.

## API

`POST /v1/feedback` with header `x-scrim-client: scrim-desktop` and JSON:

| field | |
|---|---|
| `kind` | `bug` or `idea` |
| `title`, `message` | required |
| `email` | optional, for a reply |
| `appVersion`, `os`, `meta` | filled in by the app |
| `logs` | optional text (last ~600 KB) |
| `screenshot` | optional `data:image/png;base64,...` (max 4 MB) |
| `crashId` | optional Sentry event id |

Limits: 12 reports per hour per address, 7 MB per request, a honeypot field (`website`) for bots.

## Run it locally

```
cp .env.example .env   # set DATABASE_URL and ADMIN_PASSWORD
npm install
npm start
TEST_DATABASE_URL=postgres://... npm test
```
