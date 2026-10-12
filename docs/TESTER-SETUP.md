# Running ThankYou for UAT

## A. On your own laptop (already set up)

Open a terminal in the project folder (`…\Thank-you-App\thankyou-next`):

```bash
pnpm install          # once, after pulling new code
pnpm db:uat           # wipes the local database and loads the seed users + ready-made test data
pnpm dev              # starts the API (port 4000) and the web app (port 3202)
```

Open **http://localhost:3202**. Sign in with any seed user from `docs/uat/README.md`; every password is `Password!`.
Keep the `pnpm dev` window open: emails (verification, reset, invites, notifications) are printed there.
Stop with Ctrl+C. Run `pnpm db:uat` again whenever you want to start the tests from a clean state.

## B. On a new tester laptop

### 1. Install (one time)

| Tool | Windows | macOS |
| --- | --- | --- |
| Node.js 22 LTS | installer from https://nodejs.org | `brew install node@22` |
| PostgreSQL 16 | installer from https://www.postgresql.org/download/windows/ (remember the password you choose; add `C:\Program Files\PostgreSQL\16\bin` to PATH) | `brew install postgresql@16` then `brew services start postgresql@16` |
| Git (optional) | https://git-scm.com | `xcode-select --install` |

### 2. Get the code

Copy the `thankyou-next` folder from the developer (zip it **without** the `node_modules` and `.next` folders), or clone it
once the project is on GitHub. Unzip it anywhere, e.g. `C:\ThankYou\thankyou-next`.

### 3. Run the setup script

Windows (PowerShell, in the project folder):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-tester.ps1
```

macOS / Linux:

```bash
bash scripts/setup-tester.sh
```

It asks for the PostgreSQL port (Enter = 5432) and the PostgreSQL superuser password, then creates the database, writes the
config files, installs packages and loads the test data.

### 4. Start and test

```bash
pnpm dev
```

Open http://localhost:3202 and follow `docs/uat/README.md`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `psql` / `pnpm` not found | Close and reopen the terminal after installing; on Windows add PostgreSQL's `bin` folder to PATH. |
| `password authentication failed` | Wrong PostgreSQL superuser password, or a different port; run the script again. |
| `must be owner of schema public` | As the superuser: `psql -U postgres -d thankyou_next -c "ALTER SCHEMA public OWNER TO thankyou_app;"` |
| Port 3202 or 4000 in use | Close the other program (or an old `pnpm dev` window) and start again. |
| "Too many requests" when signing in repeatedly | In `apps/api/.env` set `AUTH_RATE_LIMIT_PER_MINUTE=60` and restart `pnpm dev`. |
| Pages show old data after `pnpm db:uat` | Restart `pnpm dev` and refresh the browser. |
