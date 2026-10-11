[PH ThankYou Monorepo]

Folders:
- backend/  -> API (Express + Postgres)
- web/      -> Next.js web app
- helpers/  -> shared helpers (imported by web now; mobile later)
- mobile/   -> placeholder for future mobile app

Local run:
1) backend: docker compose up -d
2) backend: cp .env.example .env && npm i && npm run dev
3) web: cp .env.local.example .env.local && npm i && npm run dev
