# Running ThankYou for UAT

## A. For the developer: give a tester access

The code is on GitHub at **https://github.com/girmaat/volunteer_services_portal** (the local folder is called
`thankyou-next`; the names don't need to match).

1. Push your latest work: `git push` (the first time: `git remote add origin https://github.com/girmaat/volunteer_services_portal.git`
   then `git push -u origin main`).
2. If the repository is private, invite the tester: on GitHub open the repository → **Settings → Collaborators →
   Add people**, and enter the tester's GitHub username or email. The tester accepts the invitation from GitHub's email.
3. Send the tester one file: `TESTER-INSTALL.bat` from the project folder (email, Teams, USB…). It already contains
   the repository address.

## B. For the tester (Windows 10 or 11)

You need: a GitHub account that the developer invited, an internet connection, and about 30 minutes.

1. Save `TESTER-INSTALL.bat` (from the developer) anywhere, for example on the desktop, and double-click it.
   - A window asks **where to put the project**. Pick any folder (Documents is fine); a
     `volunteer_services_portal` folder is created inside it.
   - If Windows says **"Windows protected your PC"**, click **More info → Run anyway**.
   - When Windows asks **"Do you want to allow this app to make changes to your device?"**, click **Yes**
     (it installs Git, Node.js and PostgreSQL).
   - If a **GitHub sign-in** window opens, sign in with the account the developer invited.
2. Wait until the window says **Setup finished** and answer **Y** to start ThankYou. Your browser opens the app
   (`http://localhost:3202`) and the **UAT Tracker**.
3. In the tracker, type your name at the top, read **How to test**, then work through the cases with **Next →**.
   For each case pick **Pass**, **Fail** or **Blocked** and write notes. Everything you record is kept in the
   browser on this computer.
4. When you're done (or at the end of each day) click **Export results (CSV)** and send the file to the developer.

Four shortcuts are added to the desktop:

| Shortcut | Use it to |
| --- | --- |
| **Start ThankYou** | start testing. Keep the "ThankYou server" window open; close it to stop. |
| **ThankYou UAT Tracker** | open the test cases and your results. |
| **Reset ThankYou test data** | go back to the starting test data (before each round, or when a case says so). |
| **Update ThankYou** | get a new version from the developer (close the "ThankYou server" window first). |

The project is in the `volunteer_services_portal` folder you chose. If you prefer VS Code: **File → Open Folder…** →
that folder, then **Terminal → Run Task…** → "ThankYou: Start (for testing)".

Every test account's password is `Password!`. The accounts are listed under **How to test** in the tracker.

### If something goes wrong

| Problem | What to do |
| --- | --- |
| The window shows **PROBLEM:** in red | Take a screenshot and send it to the developer. Running the same shortcut again is safe. |
| "winget is missing" | Open the Microsoft Store, install **App Installer**, then run `TESTER-INSTALL.bat` again. |
| "Couldn't download the project" | Check you accepted the GitHub invitation and signed in with that account. |
| "Something else is using port 3202 or 4202" | Close any open "ThankYou server" window, or restart the computer, then **Start ThankYou**. |
| A page shows old data after **Reset** | Close the "ThankYou server" window, then **Start ThankYou** again. |
| "Too many requests" after many sign-ins | Wait one minute and try again. |
| The tracker lost my results | Results live in the browser you used; open the tracker in that same browser. Use **More… → Save a backup** now and then. |

## C. Mac or Linux (developers)

```bash
bash scripts/setup-tester.sh   # asks for the PostgreSQL port and superuser password
pnpm dev
pnpm uat:tracker && open docs/uat/uat-tracker.html
```

## D. What the Windows setup does (for the developer)

`TESTER-INSTALL.bat` installs Git with winget (Windows' package manager), asks the tester for a folder, clones
the repository into `<folder>\volunteer_services_portal` and runs `scripts\tester\setup.ps1`. That script:

1. installs Node.js LTS (winget) and pnpm (npm), if missing;
2. installs PostgreSQL 16 as a Windows service (winget, unattended, generated `postgres` superuser password, port
   5433 like the developer's machine, or 5434 if 5433 is taken). If PostgreSQL was already installed it asks for
   its `postgres` password and port instead;
3. creates the same database login and database as the developer's machine (`thankyou_app` /
   the same password, database `thankyou_next`; set at the top of `scripts\tester\setup.ps1`);
4. writes `apps\api\.env` and `apps\web\.env.local` (ports 4202 / 3202, emails printed to the server window,
   development links on screen, generated secrets);
5. runs `pnpm install`, `pnpm db:uat` and `pnpm uat:tracker`;
6. adds the desktop shortcuts (`tester\*.bat`).

The generated passwords are kept in `tester.local.json` in the project folder (never committed). Every step can
be re-run safely: **Update ThankYou** runs `git pull` and then the same setup again.
