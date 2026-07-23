# DateScape game-world direction

_Production decision — July 14, 2026_

## Decision

DateScape will remain an instant, browser-first social product, but its 3D world will move from hand-authored React Three Fiber components to a dedicated **PlayCanvas Engine 2** client. The world client will be authored visually in **PlayCanvas Editor**, with source assets built in a current version of **Blender**. React and Firebase remain responsible for identity, consent, profiles, Sparks, chat, safety, and account state.

This is now a product-direction correction as well as a renderer replacement. DateScape's world is a **social open-world RPG**: persistent levels, authored quest chains, exploration, cosmetic collection, and character identity create reasons to return. Nearby people are fellow adventurers first. Cooperative objectives create natural opportunities to learn about them; profiles, Sparks, and matching remain optional outcomes after shared play.

The PlayCanvas world is now the default player experience. The existing React Three Fiber world remains available only as an explicit `worldEngine=legacy` fallback while the vertical slice reaches full interaction and performance parity. It should receive bug fixes only; no more landmark or environment expansion.

If DateScape later changes from an instant browser product to a primarily installed desktop/mobile game, reconsider Unity. That is not the current assumption.

The local Engine client is open-source and self-hosted. The private production Editor project is owned by the DateScape PlayCanvas organization, with project ID `1564176` and scene ID `2548347`.

## Current implementation checkpoint

Arrival Conservatory, Lantern Market, and Resonance Garden now use original Blender-authored environment kits in both the local Engine client and the organization-owned PlayCanvas scene. Their standards-compliant Draco runtime exports stream progressively: Arrival gates the first playable frame, Market and Garden follow without blocking interaction, and the HDR environment finishes last. A clean local run on July 15, 2026 reached interaction in roughly 0.7 seconds, Market in roughly 1.0 second, Garden in roughly 1.7 seconds, and the HDR pass in roughly 2.0 seconds with no browser errors.

The first original hero avatar is also running in both environments with a shared 20-bone rig and validated idle, walk, and Listening Crescent seated clips. The Market now contains a consent-first, two-person Listening Crescent queue and shared conversation card; blocked people are excluded before pairing, and signed-out preview visitors receive a clear account gate instead of a nonfunctional queue.

The Resonance Garden now contains a consent-gated, two-person Resonance Loom duet. Both players contribute three synchronized, no-fail tone choices through player-owned Realtime Database notes; optional synthesized feedback answers each choice, the authored Loom markers align both avatars, and a completed pattern opens a conversation prompt plus the existing private-Spark handoff. The Loom also produces a visible in-world response while the React shell retains consent and accessible controls.

Afterlight now has its first world-scale audio pass: positional shoreline, drain, canvas, sound-bowl, and Loom layers follow the authored SFX markers, while sparse original harmonic beds shift between Arrival, Market, and Garden. Sound remains optional, gesture-gated, persisted, keyboard accessible, and visually represented; the React shell and standalone client share one preference. Modal activity ducks the world bed so cooperative feedback remains clear.

The repeatable Night Journey remains as a private daily side thread, not the main progression loop. It asks the player to explore and reflect at their own pace, creates a private keepsake, and never awards social status. Persistent levels and cosmetics now come from finite authored quests, exploration, and consent-safe cooperation.

The first RPG questline is **The Sunthread Signal**. The player accepts it from Sol, travels to the Arrival Conservatory, recovers a rain prism, tunes it by completing a Resonance Loom duet with another nearby player, and returns to Sol. Turn-in awards 50 XP, reaches level 2 on the public linear curve, and unlocks the visibly equippable Sunthread scarf exactly once. A Spark, profile view, conversation duration, or match never gates or rewards the quest.

Avatar appearance now has a versioned public catalog contract. The current authored hero genuinely supports five skin tones, four hair colors, three outfit palettes, three presentation frames, scarf states, and fittings visibility; only one hairstyle is exposed because only one hairstyle mesh exists. Quest inventory and unlock ownership remain private, while presence and the renderer receive equipped catalog IDs only.

Multiplayer seating now re-arms its server cleanup and republishes an explicitly desired seat after a transient Firebase reconnect. Match creation and player-owned Resonance notes are transaction-bound to one match ID, blocked cooperative pairings exit the queue instead of recreating, and the completion handoff waits for the final server-acknowledged shared note. A Realtime Database seat-deletion trigger gives reconnects a short grace period, then checks the seats and clears an orphaned match in one server-side transaction.

Station chess moves are now server-authoritative: the callable replays board state with `chess.js`, verifies seat-session identity, turn and legality, applies idempotent action IDs, bounds history to 512 plies, and rechecks block/deletion state around the Realtime Database transaction. Direct client writes to move, FEN, result, and end-state fields are denied. Blocking also closes the canonical connection and cleans up pair visibility, signals, and the matching station incarnation.

Shared activities now end in a detached, consent-safe Afterglow. Resonance completion is recorded idempotently before either player chooses whether to return, queue again, or open a calling card. Participant-owned acknowledgements contain only match ID and server time, and the result is latched before teardown so one player's exit cannot erase the other's outcome. Listening Crescent uses the same private receipt and distinct finish/pass semantics; calling-card access never determines whether a completed moment counts.

Listening Crescent now has a replayable choose-wait-reveal round built from six authored, low-risk cards. The match owns one fixed card; each participant can immutably lock one of three predefined answers or pass from their own database path. A pass closes the round immediately for either person, reveals neither answer, and creates no Journey credit. A completed round reveals both answers without a score, records only a content-free shared-moment receipt, advances the Night Journey once, and releases both seats through an acknowledged handoff before Afterglow offers return, replay, or calling-card choices. Replay follows seat-session identity rather than comparing player clocks, while the PlayCanvas bridge reports only waiting, playing, or resolved so the place can answer with amber, teal, and gold cues without receiving answer content.

The React shell now keeps only the newest 100 mutual connections in the live world roster, while the Connections page cursor-paginates the complete history. Chat attachments use owner/message-bound Storage paths and a preallocated message ID, allowing a failed send to delete its orphaned upload while sent history stays immutable.

Fresh reciprocal co-presence is the intended admission rule for calling cards, waves, and chess invitations. The pure calling-card and signal authority modules are tested, but the shared callable, client, and Realtime Database rules are not yet fully wired; the current branch must not describe these surfaces as trusted until that integration lands. The same applies to the rules-visible account-deletion marker, final repeated Storage purge, and created-match notification path.

The latest PlayCanvas scene checkpoint is `7e492b2` — _Authored Resonance Garden and animated hero avatar_. The largest remaining quality gaps are production textures and lightmaps, broader avatar geometry and expression, low-end device and accessibility validation, a richer authored audio mix, small-room admission and sharding, and live multi-account moderated validation. Additional map area should wait until this compact route succeeds as a social place.

No staging deployment, automated browser journey, representative device pass, staffed moderation exercise, or moderated multiplayer playtest is evidenced in this repository. Presence reconciliation is O(room), discovery needs sharded retrieval beyond its fail-closed 500-document bound, legacy tokenless station records need a coordinated drain, and already-issued legacy media download URLs remain bearer URLs until their tokens or objects are rotated.

## Product north star: a social open-world RPG

The reference blend is the exploration and progression clarity of Genshin Impact or World of Warcraft with the approachable public-space sociability and self-expression of Club Penguin. DateScape must feel like a game worth playing even before anyone matches.

The durable loop is:

1. Arrive in a persistent district and choose an authored questline.
2. Explore, discover places, solve world objectives, and earn visible progress.
3. Encounter objectives that are easier, richer, or only possible with willing nearby players.
4. Learn small, low-risk things about those players through the activity itself.
5. Earn XP and cosmetic identity rewards for the adventure, never for romantic attention.
6. Optionally continue together, view a calling card, send a Spark, or match.

Progression must never punish passing, declining, leaving, blocking, or choosing solo play. Cosmetics may express achievement but must not create romantic visibility, power, or pay-to-win advantages. Future districts should multiply this loop with story arcs, group quests, collections, traversal unlocks, public events, guild-like communities, and much deeper modular character art.

## Creative north star: luminous coastal modernism

Afterlight is a coastal city built for the hour just after sunset: calm enough to feel intimate, alive enough to make approaching someone feel natural.

Its visual language combines:

- coastal resort modernism and botanical conservatories;
- Mediterranean night markets and elegant public transit;
- broad arches and terraces crossed by thin bronze ribs;
- pearl stucco, wet blue-black stone, smoked glass, glazed ceramic, canvas, water, and dense planting;
- a 70/20/10 color rule: 70% cool sea/night/garden, 20% warm inhabited light, 10% coral or mint interaction accents.

The city is sophisticated, romantic, tactile, and optimistic. It is not cyberpunk, fantasy woodland, a generic low-poly pack, or a glowing theme park.

### What must disappear

- Primitive geometry presented as architecture.
- A different visual gimmick for every landmark.
- Neon outlining on every edge.
- Procedural object scatter without composition.
- Empty, oversized plazas.
- Human-shaped light bulbs in place of expressive avatars.
- UI panels that cover the scene when an in-world cue would work.

## First vertical slice

Build one walkable 55–65 meter district, not seven half-finished destinations.

### 1. Arrival Conservatory

The safe threshold. It teaches movement, lets a player set tonight's intent, and opens onto the city with a controlled reveal. Its silhouette and lighting must make the first screenshot feel unmistakably DateScape.

### 2. Lantern Market

The social heart. Stalls, food, small performance pockets, and things to inspect make pauses feel intentional. Sightlines repeatedly reveal other people without forcing interaction.

### 3. Resonance Garden

A quieter two-person destination with water, acoustic sculpture, and a skyline overlook. It supports one excellent cooperative activity and a natural conversation pause.

The Moonline and the rest of Afterlight appear only as a composed background promise.

### Three required hero views

1. **Arrival reveal:** the conservatory opens onto warm market lights, water, and the Moonline beyond.
2. **Market life:** 8–12 varied avatars form readable social clusters without looking staged.
3. **Garden overlook:** two players share an intimate activity while the district remains visible behind them.

If these three views do not look publishable, the slice is not ready regardless of feature count.

## Art pipeline

1. Establish camera, scale, modular grid, palette, and lighting in a small mood scene.
2. Block the complete district in Blender with final player scale and traversal widths.
3. Replace the blockout by kit: structure, ground, market, garden, foliage, props, then skyline.
4. Export glTF/GLB with stable names, pivots, material slots, collision meshes, and LOD suffixes.
5. Compress geometry with the pinned glTF Transform/Draco pipeline and textures with KTX2/Basis; preserve Blender source files outside engine exports.
6. Assemble, lightmap, batch, profile, and version the district in PlayCanvas Editor.
7. Validate every art drop on a representative desktop, integrated-graphics laptop, and mid-range phone.

Use CC0 scans for material studies and secondary natural props. Architecture, signage, hero props, avatars, and the silhouette language must be custom enough to belong to DateScape.

## Avatar direction

Avatars are equal in priority to the environment because the product is about reading and trusting people.

- Soft fashion stylization: believable clothing and anatomy with simplified, flattering facial detail.
- Inclusive body shapes, skin tones, hair, mobility aids, and gender expression.
- One shared rig and carefully controlled customization slots for the first slice.
- A complete minimum animation set: idle variants, walk, jog, turn, stop, sit, wave, consent/decline, react, and paired activity poses.
- Eye focus, blinking, breathing, hand placement, and personal-space rules should prevent the uncanny mannequin effect.

Do not buy a character system until a web export, animation, customization, and redistribution test proves it fits the pipeline.

## Product architecture

The React/Firebase shell owns identity, intent, profiles, consent, Sparks, chat, and safety. A versioned message bridge passes a narrow public presentation to the dedicated PlayCanvas client, which owns scene, camera, movement, animation, audio, and interaction cues. Blender and PlayCanvas Editor remain the asset-authoring pipeline.

The bridge does not send Firebase credentials, private profile documents, exact locations, email addresses, or moderation internals. The shell sends a public local-player presentation and filtered remote snapshots. The client returns movement snapshots and typed interaction events. During the local spike, the iframe is same-origin and therefore is an organizational code boundary, not a security sandbox; production should serve the game from a dedicated controlled origin before treating the separation as a security boundary.

The current proof uses this deliberately small protocol subset:

- Shell to game: `BOOT`, `REMOTE_SNAPSHOTS`, `AVATAR_UPDATED`, `INPUT_AXIS`, `ACTIVITY_STATE`, `JOURNEY_STATE`, `QUEST_STATE`, `AUDIO_SETTINGS`, `PAUSE`, `RESUME`.
- Game to shell: `READY`, `LOCAL_SNAPSHOT`, `LANDMARK_ENTERED`, `ACTION_REQUESTED`, `REMOTE_PLAYER_SELECTED`, `PERFORMANCE_SAMPLE`, `FATAL_ERROR`.

`LOADING_PROGRESS` remains planned. Every message carries a protocol version. Wrong-origin, wrong-source, unknown, and invalid consumed fields are ignored; each new message must add explicit payload validation on both sides. `QUEST_STATE` exposes only the active objective and target landmark; XP, inventory, unlock ownership, and private quest history never enter the iframe.

## Performance budget for the slice

| Budget                    |       Desktop | Mid-range mobile |
| ------------------------- | ------------: | ---------------: |
| Initial playable download |         12 MB |             8 MB |
| Fully streamed district   |         60 MB |            30 MB |
| Visible static triangles  |       1–1.5 M |        350–600 K |
| Draw calls                |           220 |              120 |
| Texture memory            |        350 MB |           160 MB |
| Frame rate                | stable 60 fps |    stable 30 fps |

These are starting budgets, not permission to fill them. Measure frame time, stutter, thermal throttling, and memory—not only average FPS.

## Vertical-slice acceptance

The old renderer can stop being the default only when the new slice has:

- authored environment assets and a consistent lighting/material pass;
- desktop keyboard and mobile touch movement, collision, camera, and reconnect behavior;
- one production avatar with a complete locomotion loop and one remote-player proxy path;
- Arrival, Market, and Garden landmarks wired to existing consent and activity flows;
- safe multiplayer presence with blocks applied before snapshots reach the game;
- spatial ambience, interaction audio, and at least one authored music layer;
- tested graceful fallback on unsupported or underpowered devices;
- the three hero views approved at the target quality bar.

## Production order

1. Build the engine bridge and a lighting/movement lab.
2. Produce a two-week hero-corner art test: one conservatory bay, one market stall, planting, water, one avatar.
3. Lock the style only after that corner works in motion on desktop and mobile.
4. Build the compact district and one cooperative Garden activity.
5. Run repeated 8–12 person moderated sessions before expanding the map.

The engine removes an authoring bottleneck. The high-end result still depends on deliberate environment art, character art, animation, lighting, sound, and technical-art passes. More procedural code will not substitute for those disciplines.
