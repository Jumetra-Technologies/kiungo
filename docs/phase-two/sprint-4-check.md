# Sprint 4 check: signing in and the code editor

What Brad checks before the Sprint 4 gate, on Windows and on Linux. About 25 minutes.

## Before you start: a backend with the desktop sign-in routes

Production's backend doesn't have them yet (that's Masden's deploy, through Juma's pipeline). Run jumetra-backend locally from `main` once #3 is merged, or from `feat/auth-reconcile`:

```bash
cd jumetra-backend
pip install -r requirements.txt
KIUNGO_WEBSITE_URL=http://localhost:3000 python run_api.py        # http://127.0.0.1:8000
```

Then the website against it (`.env.local`: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`), `npm run dev`, and the desktop app:

```bash
KIUNGO_API_URL=http://127.0.0.1:8000 npm run desktop
```

On Windows PowerShell: `$env:KIUNGO_API_URL="http://127.0.0.1:8000"; npm run desktop`.

The `kiungo://` link only reaches an installed Kiungo, or one started with `npm run desktop`, which registers it while it runs. If your browser asks to open Kiungo, allow it.

## 1. First run: one screen, one action (DSK-01)

1. Start Kiungo with no saved sign-in. It shows **Sign in to Kiungo** and one button. No tour, nothing else.

## 2. Sign in through the website (DSK-02)

1. Click **Sign in with your browser**. The website's sign-in page opens and Kiungo says **Finish in your browser**.
2. Sign in with Google or GitHub. The page asks **Sign in to Kiungo on <your computer's name>?** Check the name is your computer.
3. Click **Yes, sign in**. The browser asks to open Kiungo: allow it. Kiungo shows Home, with your initials or photo at the top right.

Pass: the round trip works on Windows and on Linux.

## 3. Stay signed in (DSK-02)

1. Quit Kiungo and start it again: still signed in.
2. Turn the network off, quit and start again: still signed in. The account menu says you're offline.
3. On Linux without a keyring, the account menu says you'll sign in each time. That's on purpose: the session isn't written to disk unencrypted.

## 4. Sign out and switch account (DSK-03)

1. Account menu > **Sign out**. Kiungo shows the sign-in screen.
2. Sign in again: your projects are all still on Home.
3. Account menu > **Switch account**: the website page has **Use another account** under the question.

## 5. The editor works with the network off (EDT-01 to EDT-03, EDT-06)

1. Turn the network off. Open a project. The code shows on the right.
2. Type in `sketch.ino`. **Saved** shows a moment after you stop. Open the file in Notepad from **Show in folder**: your change is there.
3. Type `// 1 2 3 /` in the editor: it goes into the code. The parts panel doesn't open and the view doesn't change.
4. Press Ctrl+F: the find bar opens. Try find and replace.
5. **New file** > `motor.h`: it opens in a new tab with an include guard. Rename it from its tab's menu; move it to the trash and check the Recycle Bin has it.
6. Press **Run** in the editor (or Ctrl+Enter): the lab runs. **Stop** stops it. **Upload** is greyed out until USB boards (sprint 6).
7. Ctrl+E hides and shows the code; drag the divider.

Pass: the editor works with the network off on both systems.

## The gate questions

- Does sign-in feel like one smooth step?
- **First run needs the internet.** DSK-01 says the first run has one action, Sign in. Until production has the desktop routes, and for anyone offline on first start, Kiungo offers **Use Kiungo without signing in**. Keep that, or make signing in strictly required once production is ready?
