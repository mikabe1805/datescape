# Release-readiness checklist

What stands between this branch and "real users can rely on this for dating."

Legend:

- `[x]` means the implementation or automated source check exists in this branch.
- `[ ]` means external evidence is still required. A source check never implies deployment, device validation, or operational readiness.

## A. Repository authority and correctness

- [x] The root, game client, and Functions projects are covered by `npm run check:ci` and the CI workflow.
- [x] Firestore rules, Realtime Database rules, Storage rules, and Firestore indexes are source-controlled.
- [x] Curated discovery is requested through an authenticated callable, sanitizes public profile output, applies two-way dealbreakers and blocks, protects concurrent decisions, and fails closed above its current candidate bound.
- [x] Private user documents are owner-only; clients do not create canonical introduction or match authority.
- [x] Like, Pass, unmatch, mutual promotion, and block closure are transactional server operations; direct match-lifecycle updates are denied.
- [x] Mutual world interest is promoted only from two independent Sparks on trusted shared-encounter evidence.
- [x] Station chess validates seat sessions, turn order, legal moves, action idempotency, blocks, deletion tombstones, and the 512-ply bound on the server; clients cannot write chess state directly.
- [x] Chat history is paginated and remains read-only when its match is ended or invalid.
- [x] The Connections page cursor-paginates complete history while the live world roster is deliberately bounded to the newest 100 mutual connections.
- [x] Message read receipts, reactions, typing state, and new message writes are constrained to their intended participants and lifecycle.
- [x] New chat-media uploads require an active match and an owner/message-bound path; Storage collection listing and object replacement are denied, and the owner can delete an orphan only before its message exists.
- [x] Signal, unread-message preview, and notification reads are bounded.
- [x] Reciprocal block state is projected into world services and used by discovery, presence, station pairing, shared encounters, and connection/chat admission; block cleanup revokes pair visibility, signals, and matching station state.
- [ ] Require fresh reciprocal co-presence for calling cards and route waves/invitations through a server-only, rate-limited signal callable. The pure authority modules and tests exist, but the current client/callable/rules wiring is not complete.
- [ ] Create the rules-visible `deletingAccounts/{uid}` marker before cleanup, gate every mutating service on it, and repeat Storage deletion after the final Realtime Database scrub. The server-only hashed and RTDB tombstones exist, but this complete admission fence is not yet wired.
- [ ] Notify on both newly created mutual connections and false-to-true match transitions, with current lifecycle/block/deletion checks and deterministic deduplication. The current trigger covers only document updates.
- [x] Install metadata uses Afterlight branding and generated raster icons rather than starter-project assets.

## B. Staging deployment evidence

- [ ] Select and document a non-production Firebase staging project.
- [ ] From a clean checkout, install all dependency roots and record a passing `npm run check:ci` run.
- [ ] Deploy the current Functions first.
- [ ] Deploy the current Firestore rules and indexes, Realtime Database rules, and Storage rules second.
- [ ] Verify deployed Function revisions and active rule releases in the intended project.
- [ ] Confirm every required composite index reaches the ready state.
- [ ] Configure and verify Authentication authorized domains.
- [ ] Configure the web-push VAPID key and SendGrid secrets in staging without exposing them to the client bundle.
- [ ] Record a clean staging-candidate run of the checked-in behavioral Firestore, Realtime Database, and Storage emulator suite; the local `npm run check:ci` gate already executes it.

## C. Two-account integration matrix

- [ ] Two accounts can enter Afterlight, see only permitted presence, disconnect, reconnect, and rotate sessions without stale-player leaks.
- [ ] Waiting, pairing, leaving, and reconnecting work at Listening Crescent and Resonance Loom without exposing another pair's private match payload.
- [ ] Both directions of a Spark create exactly one mutual connection and one usable chat.
- [ ] Each account receives the expected match card and the newest chat page; loading earlier pages preserves scroll position.
- [ ] Text, image, video, audio, read receipt, reaction, and typing behavior are correct while active.
- [ ] Ending or blocking a match immediately prevents new messages, typing mutations, and new media uploads while preserving only the intended history access.
- [ ] A block is tested in both directions during presence, station use, invitation, activity, connection, and chat.
- [ ] Calling cards and waves/chess invitations are accepted only while both accounts have fresh reciprocal room presence; stale, one-way, blocked, deleting, and replayed actions fail closed.
- [ ] Report records contain the required evidence and reach the moderation environment.
- [ ] Account deletion removes or anonymizes every documented Auth, Firestore, Realtime Database, Storage, token, report, and activity reference.
- [ ] Offline, retry, duplicate delivery, stale trigger, and partial-failure cases produce safe and understandable states.

## D. Data remediation and safety operations

- [ ] Run `security:purge-profile-secrets` in dry-run mode in an authorized environment and retain the reviewed result.
- [ ] Decide whether the dry-run warrants applying cleanup, token revocation, password resets, or user notification.
- [ ] Define report reason taxonomy, evidence access, retention, moderator roles, escalation, response targets, and audit logging.
- [ ] Exercise impersonation, harassment, evasion, repeated-account, and emergency escalation scenarios with trained moderators.
- [ ] Define deletion and retention policy for messages, reports, analytics, activity receipts, and backups.
- [ ] Inventory legacy media download URLs and rotate or delete objects whose bearer access must be revoked.
- [ ] Drain or migrate legacy tokenless station records before rolling out the stricter seat-session contract.
- [ ] Complete legal, privacy, age-assurance, terms, and jurisdiction review for the intended launch cohort.

## E. Device, accessibility, and communication evidence

- [x] The first-run route enters the world without a competing delayed overlay.
- [x] Empty discovery and connection states provide useful next actions.
- [x] The default renderer adapts its resolution tier and keeps sound locked until deliberate interaction.
- [ ] Complete keyboard-only and screen-reader journeys for signup, arrival, discovery, connection, chat, block, report, and deletion.
- [ ] Verify focus visibility, contrast, 200% zoom/reflow, reduced motion, captions or text equivalents, and touch target sizes.
- [ ] Test representative iPhone, Android, desktop, low-memory, slow-network, and constrained-GPU devices.
- [ ] Record browser-level journey evidence; no automated browser run has been performed for this branch.
- [ ] Verify install/update behavior and offline recovery for the PWA.
- [ ] Test push notifications end to end on real iOS and Android devices, including logout and token rotation.
- [ ] Verify SendGrid fallback behavior, deduplication, unsubscribe/compliance behavior, and failure logging.
- [ ] Complete the production ambience, music, interaction-sound, and mix pass.

## F. Scale and playtest gates

- [x] Current discovery refuses to return a biased partial candidate set when more than 500 user documents are present.
- [x] Presence and notification surfaces use bounded client reads or privacy-scoped projections.
- [ ] Replace the discovery scan with indexed or sharded candidate retrieval before the user collection exceeds the current bound.
- [ ] Enforce small-room admission and shard both presence and discovery before room population grows beyond the intended 10-16 person cohort; current presence reconciliation is O(room).
- [ ] Add privacy-safe crash reporting and a deliberately small product-event taxonomy.
- [ ] Run load and reconnect tests for presence, stations, chat listeners, Functions retries, and notification fan-out.
- [ ] Run five moderated Afterlight sessions with 8-12 participants and document connection quality, mutual Sparks, quiet exits, blocks, reports, return intent, and qualitative feedback.
- [ ] Resolve every release-blocking finding from those sessions and repeat the affected scenarios.

## Required order from here

1. Finish the remaining calling-card, signal, deletion-admission, and new-match-notification authority wiring; then record a clean-checkout repository gate.
2. Prepare staging configuration and review the credential-cleanup dry run.
3. Deploy Functions, then rules and indexes, then the dependent client.
4. Complete the two-account safety matrix.
5. Complete target-device, accessibility, install, notification, and media checks.
6. Establish staffed moderation and retention operations.
7. Run the moderated closed-room sessions and decide whether the evidence supports a closed alpha.

There is no credible half-day shortcut for these external gates. Until they are recorded, Afterlight remains a promising and substantially hardened prototype rather than a releasable dating service.
