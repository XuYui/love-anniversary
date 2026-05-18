# Love Anniversary

A responsive full-stack anniversary memory app for recording relationship milestones, footprints, bucket-list goals, time-locked letters, daily check-ins, wishes, and anniversary slides.

This repository is prepared as a portfolio-friendly codebase. Personal runtime data, uploaded photos, and music are intentionally excluded from Git.

## Highlights

- Express + SQLite backend with REST APIs.
- Vanilla JavaScript frontend with responsive mobile-first interactions.
- Footprint map, photo albums, bucket list, time mailbox, daily check-ins, wish pool, and anniversary slideshow.
- Configurable runtime data paths so deployments can update code without overwriting the existing database or media files.
- GitHub Actions syntax check for every push and pull request.

## Tech Stack

- Node.js 22+
- Express 5
- SQLite
- Multer for image uploads
- Leaflet for map rendering
- HTML, CSS, and vanilla JavaScript

## Quick Start

```bash
npm ci
npm start
```

Open `http://localhost:3000`.

Run syntax checks:

```bash
npm run check
```

Create a local backup before deployment:

```bash
npm run backup:data
```

## Runtime Data

The app uses these paths by default:

- database: `memory.db`
- music: `music/`
- pictures: `pictures/`

For production, keep data outside the Git checkout:

```bash
PORT=3000
DATA_DIR=/srv/love-anniversary/shared
```

With `DATA_DIR` set, the app stores data under:

- `/srv/love-anniversary/shared/memory.db`
- `/srv/love-anniversary/shared/music`
- `/srv/love-anniversary/shared/pictures`

See [DEVELOPERS.md](./DEVELOPERS.md) for development and deployment rules.
