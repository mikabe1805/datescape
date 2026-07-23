# DateScape / Afterlight

DateScape is an experimental social world where meeting someone can naturally become a date. Its current vertical slice, **Afterlight**, is a bioluminescent coastal garden built around low-pressure, consent-based activities rather than a swipe-first feed.

This repository is an R&D prototype, not a production-ready dating service. The controls described below are implemented and tested in source; that does not prove that they are deployed to any Firebase project or that the product has passed real-device, multi-account, moderation, or playtest validation.

## Current experience

- A world-first signed-in experience and a public `/afterlight` preview
- Arrival Conservatory, Lantern Market, Resonance Garden, and an authored avatar
- Visible social intent, waves, invitations, private Sparks, and mutual connections
- Consent-first Listening Crescent prompts, Resonance Loom duets, server-verified shared encounters, and server-validated station chess moves
- Curated introductions produced by a trusted callable from allowlisted public profile fields
- Server-authoritative Like, Pass, unmatch, and block transitions; block cleanup also revokes world visibility, pair signals, active station state, and chat admission
- A bounded 100-connection in-world roster plus cursor-paginated complete connection history
- Real-time connection chat with paginated history, media, voice messages, typing state, and read receipts; new attachments bind the uploader and a preallocated message ID so failed sends can delete their orphaned upload
- Block, mute, report, quiet-exit, and authenticated account-deletion cleanup
- Source-controlled Firestore, Realtime Database, Storage rules, and Firestore indexes

The product direction and remaining safety work live in [REVIVAL_PLAN.md](./REVIVAL_PLAN.md). The engine, art direction, and vertical-slice quality bar live in [GAME_WORLD_DIRECTION.md](./GAME_WORLD_DIRECTION.md). Release evidence is tracked in [RELEASE_READINESS.md](./RELEASE_READINESS.md).

## Stack

- React 18 with Create React App
- PlayCanvas Engine 2 for the default Afterlight renderer
- React Three Fiber, Drei, and Three.js for the explicit compatibility fallback
- Firebase Authentication, Firestore, Realtime Database, Storage, Cloud Functions, and Hosting
- Framer Motion and custom CSS
- Jest and React Testing Library

## Local setup

Requirements: Node.js 20 and npm.

Install all three dependency roots, then run the complete repository gate:

```bash
npm install
npm --prefix game-client install
npm --prefix functions install
npm run check:ci
```

Start the application with:

```bash
npm start
```

The app runs at `http://localhost:3000`. `/afterlight` uses the isolated PlayCanvas client built into `public/game`; `/afterlight?worldEngine=legacy` selects the React Three Fiber fallback.

Useful commands:

```bash
npm run game:dev
npm run game:check
npm run test:ci
npm run functions:check
npm run build
```

`npm run check:ci` runs the application tests, behavioral Firestore/Realtime Database/Storage emulator tests, game-client contract tests, Functions syntax and authority tests, and both production builds. These local gates are not a substitute for an authenticated staging deployment or two-account device scenarios.

## Firebase configuration and deployment

The checked-in Firebase web configuration targets the existing DateScape project. Use a separate staging project for development that writes shared data. Optional client environment variables are:

```text
REACT_APP_RTDB_URL=
REACT_APP_VAPID_KEY=
```

SendGrid and administrative migration credentials belong in Firebase secrets or an authorized Admin SDK environment, never in client variables.

Backend deployment is intentionally manual. Deploy trusted Functions first, then the rules and indexes that reserve client access, and only then release a dependent client. The repository workflow `.github/workflows/firebase-functions-manual.yml` enforces that order after running the full verification gate.

Do not infer deployment from this repository's checkmarks. Verify the active Firebase project, rule releases, indexes, callable versions, authorized domains, VAPID configuration, and two-account behavior in staging.

## Security and scale limits

Legacy signup builds may have copied password fields into Firestore profile and match documents. New writes are guarded, and the Admin SDK cleanup utility is dry-run by default:

```bash
npm --prefix functions run security:purge-profile-secrets
```

Do not use its `--apply` mode until the dry-run output has been reviewed in an authorized environment. Affected accounts may also require token revocation, password resets, and a user-notification decision.

The current discovery refresh deliberately fails closed above 500 user documents instead of returning a biased partial result. Replace that scan with indexed or sharded candidate retrieval before growing beyond that bound. Presence projection is also proportional to room population; enforce a shard cap before larger live cohorts.

Media download URLs already issued by legacy clients remain bearer URLs until the underlying objects or tokens are rotated. Storage list access is denied, but migration and retention policy still need operational validation.

Realtime presence projection currently performs work proportional to room population, and discovery scans at most 500 user documents before failing closed. Room admission, presence, and discovery must be sharded before larger cohorts. Existing tokenless station records also require a coordinated legacy drain before stricter station admission can be treated as rollout-safe.

No current artifact proves a deployed staging revision, browser or real-device journey, staffed moderation operation, or moderated multiplayer playtest. Those are explicit release blockers, not implied follow-up polish.

## Generated brand asset

The source image for the install icon is [`art/afterlight/branding/afterlight-app-icon.source.png`](./art/afterlight/branding/afterlight-app-icon.source.png). It was generated for Afterlight as a premium sea-glass and amber path emblem over dark water at blue hour, then exported to the checked-in PWA icon sizes. It contains no text, people, hearts, or stock starter branding.
