# Release-readiness checklist

What stands between today and "real users can rely on this for dating."
Group A is non-negotiable. B–C make the experience honest. D–E are the
sticking-around polish.

---

## A · Correctness — matching actually does what it promises

- [x] **Distance filter wired into matching engine** — `failsDealbreakers` now
  calls `distanceBetween` (haversine on lat/lng from each user's
  `location`) and excludes anyone beyond `distMax`.
- [x] **"No limit" sentinel** — `distMax === 100` and `ageMax === 100` skip the
  cap entirely. UI shows "No limit" instead of "100 mi" / "100".
- [x] **Permissive missing-location** — if either user hasn't shared
  coordinates yet, distance check is skipped (not "fail closed"), so
  partial-profile users still see candidates.
- [x] **Looking-For separation** — `isIntentCompatible` already keeps
  Friendship and Dating queues from cross-contaminating; "Both" matches
  either side.
- [x] **Match cards label intent visibly** — green "Friendship" pill,
  amber "Dating" pill, lavender "Friends or dating" pill on every queue
  card.
- [x] **Distance shown on match cards** — "<1 mi away", "3.4 mi away",
  "27 mi away" tier.
- [x] **Two-way age fit** — `failsDealbreakers` now checks both
  directions inside the function (defensive: also called twice from
  `generateMatchesForUser`).
- [x] **Two-way gender fit** — same: `genderPrefMismatch` is called for
  both `(A.pref, B.gender)` and `(B.pref, A.gender)`.

## B · Profile completeness

- [x] **Location collected at signup** — new required Step 3 with auto
  (browser geolocation) + manual (Nominatim geocode) fallback.
- [x] **Location editable in profile** — new section + visible warning
  if `lat`/`lng` missing.
- [x] **Missing-location banner on the queue** — links straight to the
  profile location section.
- [x] **Photos required at signup** — already enforced.
- [x] **Sane defaults** — new accounts default to `ageMax: 100` (no
  upper limit) and `distMax: 100` (no limit) so an unfilled-out
  preferences page doesn't accidentally exclude everyone.
- [x] **Required fields enforced before queue** — Match Queue now shows
  a "Profile X% complete — finish to be visible" banner listing exactly
  which required fields (`name`, `age`, `gender`, `looking-for`,
  `photos`, `location`) are missing. Replaces the old location-only banner.

## C · Communication

- [ ] **Push notifications end-to-end test on a real device.** Code path
  exists (`initMessagingForCurrentUser`, FCM token saved to user doc),
  but the cloud function that *sends* a push on new match / new message
  needs verification with a real iPhone or Android device on Vercel
  hosting (HTTPS required for service worker).
- [x] **Email fallback for inactive users.** Cloud functions
  `notifyOnMatchActivated` and `notifyOnNewMessage` (in `functions/index.js`)
  send SendGrid email when the recipient is inactive (`lastActive >5 min`)
  and gates duplicates with `notifiedWhileInactive` / `notifiedMatchWhileInactive`.
  Just needs `firebase deploy --only functions` + a real-device test.
- [x] **Mutual world-likes promote to real Firestore matches** — already
  done via `matchBridge.js`.
- [ ] **Verify chat works after a Firestore match** end-to-end with two
  real accounts (not just world likes) — both should see the match card,
  both can chat, messages persist.

## D · Safety

- [x] **Block + report actually persist and prevent re-matching.**
  `blockUser` now writes `blockedUsers: arrayUnion(otherId)` on the
  current user's doc, deactivates the existing match, and
  `failsDealbreakers` checks `blockedUsers` on both sides. `reportUser`
  records reporter + reportee + reason in the `reports` collection. Chat
  dropdown and MatchOptionsMenu both wired up with confirmation.
- [x] **Age gate at signup** — birth-date validated >= 18 in Step 2.
- [x] **Photo report path** — `reportPhoto(otherId, url, reason)` in
  MatchActions writes a `type: "photo"` record to the `reports`
  collection, surfaced as a "Report photo" pill on every carousel slide
  in `MatchDetail`.
- [x] **Account deletion verified to cascade.** New
  `src/utils/AccountDeletion.js` deletes: all matches (active + inactive)
  + their `messages` and `typingStatus` subcollections, RTDB world likes
  (both directions), signals, presence in every room, Storage media at
  `userMedia/{uid}`, push tokens, reports the user filed, the user doc,
  then the auth account. Each step wrapped in `safe` so a partial
  failure doesn't strand the rest.

## E · Polish & retention

- [x] **Empty-state CTAs everywhere.** Queue empty → "Widen Distance"
  button (only shown if `distMax < 100`; bumps to no-limit and reloads),
  alongside "Refresh Queue" and "Edit Profile". Likes empty → "Open
  Match Queue" + "Edit Profile". Matches empty → already there.
- [x] **First-launch tour.** New `FirstLaunchTour` component renders an
  overlay with a 5-row map of Queue / Likes / Matches / Explore / Profile
  on first authenticated render. Dismissal is persisted in
  `localStorage["datescape:firstLaunchTourSeen"]`.
- [x] **Bundle splitting.** Confirmed: every `three`/`@react-three`
  import lives under `src/game/*` and is only reached through
  `WorldPage`, which is `React.lazy` in `MainApp.js`. CRA/Webpack will
  emit it as a separate chunk fetched on first `/app/explore` visit.
- [ ] **Deploy preview links** for testers — Vercel preview per PR is
  fine; pin the production URL on a real custom domain before
  competition submission.
- [ ] **Soft-launch on a small group** before the demo to surface bugs
  you can't catch alone. 5 friends × 24 hours catches more than my
  audit ever will.

---

## Firebase config still needed (one-time)

These are console actions — they can't be done from code:

- [x] **Realtime DB enabled** — confirmed (you fixed the bucket-name
  thing already).
- [x] **Storage CORS** — `cors.json` deployed to `gs://datescape-ed925.firebasestorage.app`.
- [x] **Storage rules** — `firebase deploy --only storage`.
- [x] **Database rules** — `firebase deploy --only database`.
- [ ] **Auth authorized domains** — add your Vercel production and
  preview domains in Console → Authentication → Settings.
- [ ] **Firestore indexes** — when `generateMatchesForUser` does
  `where("participants", "array-contains", uid)` at scale, it needs a
  composite index. Watch the console for "Index needed" errors and
  click the auto-create link.
- [ ] **Web Push VAPID key** in `.env`/Vercel env (`REACT_APP_VAPID_KEY`).

## What I'd do next, in order

1. **Two-way age + gender fit, plus blocks-as-dealbreaker** — 30 min.
   Closes the matching-correctness loop.
2. **Push notifications end-to-end smoke test** — 1 hr. The backend
   cloud function probably already exists; deploy + test from a phone.
3. **Account-deletion cascade** — 1 hr. Real users will try this and
   you don't want orphaned data.
4. **First-launch tour + empty-state CTAs** — 2 hr. The retention
   difference between "I bounced because nothing was here" and "I knew
   what to do next" is huge.
5. **Soft-launch with 5 friends** — get one real night of usage logs
   before submission.

If you want to ship to the competition this round, that's roughly a
half-day of work. Skip 4–5 in a pinch — but A and the auth domain
config from B are non-negotiable.
