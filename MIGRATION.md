# Supabase → Firestore migration — manual setup steps

You only need to do this once. After this, the dashboard never pauses.

## Why Firestore?

- Free tier never auto-pauses for inactivity (Supabase did)
- Native real-time listeners (preserves the "updates across phones in 2s" UX)
- Google-backed, free tier stable since 2014
- 50K reads/day + 20K writes/day = enormous headroom for a single-location dashboard

---

## Step 1 — Create the Firebase project (5 min, browser)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Add project** → name it `chipotle-tracker` (or whatever) → disable Google Analytics → **Create project**.
3. On the project home page, click the **Web** icon (`</>`) to register a web app:
   - App nickname: `Green St. Chipotle Tracker`
   - Do **not** check "set up Firebase Hosting"
   - Click **Register app**
4. You'll see a `firebaseConfig` object. **Keep this tab open** — you need these values for Step 3.

## Step 2 — Enable Firestore + lock it down with rules

1. In the left sidebar, click **Build → Firestore Database** → **Create database**.
2. Pick the location closest to UIUC: `us-central1` (Iowa) is fine.
3. Start in **production mode** (the default).
4. Once the database is ready, go to the **Rules** tab.
5. Open `firestore.rules` from this repo, copy the entire contents, paste it into the Firebase rules editor, and click **Publish**.

The rules I wrote allow anyone to read reports and submit new ones, but only with a valid status (`walkin` / `medium` / `long` / `outthedoor`) and a server-stamped timestamp. Reports are immutable.

## Step 3 — Wire up environment variables

Take the `firebaseConfig` values from Step 1 and add them to **two places**:

### Local — edit your `.env` file

Replace your existing Supabase vars with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=chipotle-tracker.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=chipotle-tracker
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=chipotle-tracker.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### Vercel — Project Settings → Environment Variables

Add the same six variables, scope = **All Environments** (Production, Preview, Development), then **Save**.

> Note: these are public values. Firestore security comes from the rules in Step 2, not from hiding the config — so it's safe to expose them in the browser bundle.

## Step 4 — Test locally

```bash
npm run dev
```

Open <http://localhost:3000>:
- Status card should show **UNKNOWN** (no reports yet — fresh DB)
- Tap any report button (e.g. **Walk-In**)
- Status should update to **WALK-IN** within 1–2 seconds
- Open the same URL in a second browser tab → it should also show the new status without you reloading. **That's the realtime listener working.**

If it doesn't update across tabs, the most likely cause is a typo in one of the env vars or that Firestore rules are blocking the write — check the browser console for errors.

## Step 5 — Deploy

```bash
git add .
git commit -m "Migrate from Supabase to Firestore"
git push
```

Vercel auto-deploys. Hit your live URL and verify the same flow.

## Step 6 — Optional cleanup

Once everything works on production:
- Pause or delete the old Supabase project at <https://supabase.com/dashboard> (no rush — it'll auto-pause anyway)
- You can delete this `MIGRATION.md` file and `firestore.rules` is safe to keep in the repo for reference

## What changed in the code

| File | Change |
|---|---|
| `package.json` | Removed `@supabase/supabase-js`, added `firebase` |
| `lib/supabase.ts` | Deleted |
| `lib/firebase.ts` | New — lazy Firestore client + `Report` type |
| `app/page.tsx` | Swapped initial-fetch + channel subscription for a single `onSnapshot` listener; swapped `.insert()` for `addDoc()` with `serverTimestamp()` |
| `firestore.rules` | New — security rules to paste into the Firebase Console |
| `MIGRATION.md` | This file |

The optimistic UI on tap, the 30-minute majority vote, the cooldown, the heat map, and everything visual — all unchanged.
