# Developer Guide

## Goal

Keep this repository portfolio-ready while making every future deployment safe for existing user data.

## Local Development

1. Install dependencies with `npm ci`.
2. Start the server with `npm start`.
3. Open `http://localhost:3000`.
4. Run `npm run check` before every commit.

Node.js `>=22.9.0` is required because the current dependency tree expects modern Node builds.

## Data Safety Rules

- Never commit `memory.db`, `.env`, `data/`, `backups/`, uploaded photos, or music files.
- Runtime data must live outside the Git checkout on production servers.
- Recommended production config:

```bash
PORT=3000
DATA_DIR=/srv/love-anniversary/shared
```

- Before deploying code changes, run:

```bash
npm run backup:data
```

- If database schema changes are needed, only use additive migrations by default:
  - `CREATE TABLE IF NOT EXISTS ...`
  - `ALTER TABLE ... ADD COLUMN ...`
- Do not drop tables, rename tables, truncate data, or rewrite media folders without a manual backup and explicit approval.
- Uploaded images must continue to resolve under `/pictures/...`; music must continue to resolve under `/music/...`.

## Deployment Checklist

Use this flow on the server:

```bash
cd /srv/love-anniversary/app
npm run backup:data
git pull --ff-only
npm ci --omit=dev
npm run check
pm2 restart love-anniversary
```

If the server does not use PM2, replace the last command with the host's actual restart command.

Do not delete or replace `/srv/love-anniversary/shared`. That directory is the persistent data volume.

## GitHub Upload Requirements

- Commit only source code, documentation, config examples, and CI files.
- Keep real personal photos, music, SQLite databases, and secrets out of GitHub.
- The default branch is `main`.
- Commit messages should be concise and action-oriented, for example `Prepare portfolio-ready GitHub release`.
- Every push must pass `npm run check` locally and in GitHub Actions.
- README must stay useful to a reviewer: features, stack, run commands, and deployment/data notes should remain current.
- New features should include any API, data, or deployment impact in `DEVELOPERS.md`.

## Code Standards

- Keep frontend changes in `public/index.html`, `public/style.css`, and `public/app.js`.
- Keep backend API changes in `server.js`.
- Prefer small, focused functions and avoid unrelated refactors.
- Escape user-rendered text with `escapeHtml`.
- Use configurable paths through `DATA_DIR`, `DB_PATH`, `MUSIC_DIR`, and `PICTURES_DIR` instead of hard-coded production paths.
- Preserve backward compatibility with existing SQLite rows and existing media URLs whenever possible.
