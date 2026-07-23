# DateScape revival plan

_Product and technical review, updated July 19, 2026_

## The product thesis

> **DateScape is a social world where meeting someone can naturally become a date.**

The world is the primary experience. Profiles, introductions, chat, and safety support what happens there instead of competing with it as separate product silos.

The first vertical slice is **Afterlight**, a luminous coastal garden city at blue hour. Arrival Conservatory, Lantern Market, and Resonance Garden form one compact route. The current branch is a functional product and art-direction slice with authored environments, an avatar, shared activities, social handoffs, and a trusted Firebase authority layer. It is not yet evidence of a production-ready dating service.

## What is implemented in this branch

- World-first navigation and a public `/afterlight` preview
- A dedicated PlayCanvas client with progressively loaded authored districts, desktop and touch movement, collision, camera constraints, a compatibility renderer, and adaptive resolution
- A rigged hero avatar, customization, remote-player presentation, social intent, waves, and invitations
- Listening Crescent, Resonance Loom, Rainlight Relay, and Lanternkeeper activity flows, with trusted completion paths for shared progression where applicable
- Private Sparks and trusted shared-encounter promotion, server-authoritative Like/Pass/unmatch decisions, a bounded in-world connection roster, cursor-paginated complete connection history, and paginated chat
- Match-owned media and voice attachments whose owner/message-bound paths allow failed sends to delete their orphaned upload without making sent history mutable
- Server-validated station chess with seat-session identity, legal move and turn checks, idempotent action IDs, bounded history, and block-race eviction
- Server-produced curated introductions with an allowlisted public profile projection, block checks, concurrency protection, cooldowns, and bounded candidate reads
- Owner-only private profiles, participant-scoped matches and chat, reciprocal world-block projections, bounded signal and notification reads, and source-controlled Firestore, Realtime Database, and Storage policy
- Trusted cross-service account-deletion cleanup and dry-run security migration utilities; a rules-visible deletion-admission marker and final repeated Storage purge are still being wired
- A generated Afterlight app icon, preserved at [`art/afterlight/branding/afterlight-app-icon.source.png`](./art/afterlight/branding/afterlight-app-icon.source.png), and corrected install metadata
- Repository-wide CI plus a separate manual backend workflow that deploys Functions before dependent rules and indexes

These statements describe source and automated checks. They do not establish that the controls are deployed or that real users have validated them.

## Intended 15-25 minute session

1. **Declare tonight's intent.** The choice controls social visibility and suggested destinations.
2. **Enter a small compatible room.** Aim for roughly 10-16 people, not an empty MMO map or a crowded feed.
3. **Notice people through activity.** Music, collaborative play, observation, and quiet garden moments provide social context.
4. **Request an approach.** A wave or invitation is a consent gate; proximity alone does not open unrestricted communication.
5. **Share a moment.** A lightweight two-person or small-group activity creates something real to discuss.
6. **Send a private Spark.** Neither person sees rejection. A mutual Spark creates a connection.
7. **Continue privately.** Chat, voice, or planning a date becomes available only after mutual consent.

## District plan

| Place | Social purpose |
| --- | --- |
| Arrival Conservatory | Set intent, learn controls, and enter safely |
| Lantern Market | Low-pressure browsing and the Listening Crescent |
| Resonance Garden | Collaborative sound play and quiet proximity |

Finish these three places, one excellent interaction in each, and one mutual-only continuation before adding map area.

## Release blockers and evidence still needed

### Security and operations

- Audit deployed Firestore data for legacy password copies. Review the cleanup dry run, remediate affected records under authorization, revoke tokens or reset passwords where appropriate, and make a user-notification decision.
- Deploy the trusted Functions first and the checked-in Firestore rules, indexes, Realtime Database rules, and Storage rules second. Verify the active releases rather than inferring deployment from source.
- Run behavioral Firebase Emulator Suite tests and two-account staging scenarios for discovery, mutual connections, blocking, station access, ended chat, media upload, account deletion, and reconnect races.
- Decide how reports are reviewed, retained, escalated, and audited. A write path without staffed moderation is not a safety system.
- Define media retention and rotate or delete legacy Storage objects whose already-issued download URLs must no longer work.
- Verify that a block immediately ends or isolates every active activity type. Any client-authoritative game that cannot meet that bar should be disabled for the closed alpha.
- Finish routing calling-card access and world waves/chess invitations through server authority that requires fresh reciprocal co-presence, derives public display fields, rate-limits delivery, and rejects stale responses. The pure authority logic is tested, but the shared client/callable/rules wiring is not complete.
- Finish the rules-visible deletion admission marker, mutation guards, and final repeated Storage purge; then prove that an already-issued token cannot recreate Firestore, Realtime Database, or Storage data after deletion begins.
- Cover both newly created mutual matches and false-to-true transitions in notification triggers, with lifecycle, block, deletion, and deterministic deduplication checks.

### Scale and reliability

- Replace the current fail-closed 500-user discovery scan with indexed or sharded candidate retrieval before exceeding that bound.
- Enforce a room population cap and then shard the presence projection and discovery retrieval. Presence reconciliation is O(room), and discovery currently scans at most 500 user documents before failing closed.
- Drain or migrate legacy tokenless station records before relying on the strict seat-session contract in a deployed rollout.
- Add privacy-safe crash reporting and a minimal event set for arrival, approach, shared activity, Spark, connection, block, and report outcomes.
- Exercise offline, reconnect, duplicate-event, stale-session, and partial-deletion behavior against staging services.

### Experience quality

- Run a complete keyboard, screen-reader, contrast, focus, reduced-motion, and zoom pass.
- Validate frame pacing, memory, asset streaming, touch controls, install behavior, push notifications, and media capture on target phones and lower-end laptops.
- Replace the procedural-first sound bed with a production ambience, music, interaction, and mix pass while preserving sound-off defaults and explicit user activation.
- Continue the authored art pipeline with lightmaps, compressed textures, LODs, instancing, occlusion-aware composition, broader avatar expression, and inclusive customization.
- Conduct moderated tests with enough simultaneous participants to judge the actual social thesis, not only isolated usability.

There is currently no evidence in this repository of a deployed staging revision, an automated browser journey, representative real-device validation, staffed moderation operations, or a moderated multiplayer playtest. Already-issued legacy media download URLs also remain bearer URLs until their objects or tokens are rotated. Each item is a release blocker for a dating service, not a post-launch task.

## Milestone sequence

### 1. Trusted staging room

1. Create or select a non-production Firebase staging project.
2. Install and run `npm run check:ci` from a clean checkout. This gate includes the behavioral Firestore, Realtime Database, and Storage emulator suite as well as application, game-client, Functions, and production-build checks.
3. Deploy Functions.
4. Deploy Firestore rules and indexes, Realtime Database rules, and Storage rules.
5. Verify the deployed versions and service configuration.
6. Run the credential-remediation dry run without applying changes.

### 2. Two-account safety matrix

Use two or more authenticated accounts to prove both directions of every consent and denial flow: approach, activity join/leave, Spark, match, chat, media, read receipts, block, report, account deletion, refresh, disconnect, and reconnect. Capture expected and observed results.

### 3. Target-device pass

Test the primary journey on representative iOS, Android, desktop, keyboard-only, reduced-motion, high-zoom, and constrained-GPU configurations. Record frame time, memory, failed network behavior, install, notification, and media evidence.

### 4. Afterlight closed-room playtest

Run five moderated sessions with 8-12 people. Measure meaningful conversations, mutual Sparks, return intent, blocks, reports, quiet exits, and participant descriptions of the experience. Do not use time spent alone as the success metric.

## Alpha success criteria

The first serious alpha is ready only when:

- a new player can understand the premise, choose an intent, meet someone, share an activity, mutually connect, and continue privately without staff explanation;
- no private account fields are available through discovery, matches, presence, logs, media listing, or other client-readable collections;
- a block takes effect across every surface and reports reach an operational moderation queue;
- the district holds its visual identity and interaction quality on target desktop and mobile hardware at stable frame rates;
- staged deletion and retention checks leave no unintended personal data behind; and
- test users describe Afterlight as "a place where I met someone," not "a dating app with a 3D lobby."
