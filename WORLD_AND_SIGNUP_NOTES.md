# Setup notes — multiplayer world + signup fix

This file captures the manual Firebase configuration steps you need to run
once. None of them require code; they are console + CLI actions.

## 1. Realtime Database (multiplayer presence)

Used by the Explore world for live presence, station seats, chess sync, and
mutual-like signals.

- Firebase Console → Build → **Realtime Database** → Create database (default
  region is fine).
- Copy the `databaseURL` shown (something like
  `https://datescape-ed925-default-rtdb.firebaseio.com`).
  - If it differs from the default, set it in `.env.local`:
    ```
    REACT_APP_RTDB_URL=https://your-actual-url.firebasedatabase.app
    ```
  - Otherwise the default in `src/firebase.js` is correct.
- Deploy the rules:
  ```
  firebase deploy --only database
  ```

Until this is done, presence writes log a one-time warning and the world
falls back to single-player.

## 2. Cloud Storage (photo + video uploads)

The "Completing your profile setup…" hang you saw was a double-upload bug
(now fixed in `src/components/MultiStepSignup.js`). But you still need:

### a. Storage rules

```
firebase deploy --only storage
```

This installs `storage.rules` so authenticated users can write only to their
own `userMedia/<uid>/...` path. Without rules, you'll see
`storage/unauthorized` upload failures after the default 30-day grace expires.

### b. CORS for the bucket

**This is the fix for the upload error you're seeing right now.** The
console error `CORS policy: Response to preflight request doesn't pass
access control check: It does not have HTTP ok status` means your Storage
bucket has no CORS config installed.

The bucket name (verified from your Firebase config) is
`datescape-ed925.appspot.com`. The included `cors.json` already covers
localhost:3000, localhost:3030, the firebase-hosted domains, and any
`*.vercel.app` preview URL.

To install — pick whichever you have available locally:

```
# Option A — gsutil (comes with gcloud SDK)
gsutil cors set cors.json gs://datescape-ed925.appspot.com

# Option B — gcloud (newer alternative)
gcloud storage buckets update gs://datescape-ed925.appspot.com --cors-file=cors.json
```

If neither tool is installed, easiest path:

1. Install gcloud: https://cloud.google.com/sdk/docs/install
2. `gcloud auth login`
3. Run option B above.

After it succeeds, just retry signup — no redeploy needed. The bucket
config is server-side, so a hard refresh of localhost is enough.

If you add a custom domain later, add it to `cors.json` and re-run the
command.

## 3. Authentication authorized domains

Firebase Auth only accepts sign-in requests from domains in its allowlist.

- Firebase Console → Build → **Authentication** → Settings tab → Authorized
  domains.
- Add:
  - `localhost` (usually pre-added)
  - your Vercel production domain (e.g. `datescape.vercel.app`)
  - any custom domain you use (e.g. `datescape.app`)
- Vercel preview URLs (`datescape-git-*.vercel.app`) — add the wildcard
  pattern your console allows, or add specific previews you want to test.

The "Google CORS error" you saw on localhost most likely comes from this
list missing the calling origin, not from Storage CORS.

## 4. Verifying

After all three are done, run signup end-to-end on the Vercel deployment:

1. Step 1–4: text only, should work without any Firebase config.
2. Step 5: pick a photo. The "Uploading photos (1/N)…" message will tick
   per file. If a file fails, you'll see an inline error toast with retry +
   skip options — not a hung loader.
3. Step 6 (only if Looking-For is Dating or Both): preferences. Sliders are
   amber, dropdowns are dark.
4. After "Welcome to DateScape", you land on `/app/match-queue`.

If signup hangs again at "Completing your profile setup…", check the
browser console — failures now log a clear reason and you can copy/paste it
to me.

## 5. Multiplayer demo tip

To see the world's multiplayer working from a single machine: open one
normal browser tab + one incognito tab, sign in with two different
accounts, walk around. You should see each other's avatars within a few
seconds, with name tags, emote bubbles, and chat bubbles working.
