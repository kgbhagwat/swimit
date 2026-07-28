# Registration App

TypeScript full-stack app with a responsive registration form.

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Frontend | React + Vite |
| Backend | Express (ESM) |
| Database | PostgreSQL (`pg`) |

## Setup

```bash
docker compose up -d
npm install
npm run db:init
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health
- Postgres: `localhost:5435` (user/pass/db: `app`)

## Features

- Personal details, emergency contact, medical info, identity & photos
- English / Marathi / Hindi language toggle
- Camera capture + file upload (max 200 KB per photo)
- Form data saved to PostgreSQL
