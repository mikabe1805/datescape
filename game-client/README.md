# DateScape PlayCanvas client

This folder is the isolated PlayCanvas renderer for the Afterlight world. It runs the first compact vertical slice with original Arrival, Market, Garden, and hero-avatar assets while React and Firebase retain the social-product boundary.

From the repository root:

```powershell
Set-Location game-client
npm install
Set-Location ..
npm run game:dev
npm run game:check
npm run game:build
```

Install the isolated game package after the root package. Keeping its toolchain separate prevents Vite and modern TypeScript from colliding with the legacy Create React App dependency graph.

`game:build` writes an ignored bundle to `public/game`, which the React production build copies into its output. To try the bridge inside the existing shell after building, open:

```text
/afterlight
```

Use `/afterlight?worldEngine=legacy` only for the explicit React Three Fiber compatibility fallback.

For live engine iteration, run `npm run game:dev` and open the Vite address directly. A future development convenience can point `REACT_APP_GAME_CLIENT_URL` at that address while the React shell runs separately.

## Boundary

- This client owns scene rendering, movement, camera, animation, audio, and spatial interaction cues.
- The React shell owns Firebase, identity, consent, Sparks, chat, safety, and accessible modal UI.
- Communication uses the versioned `postMessage` protocol in `src/bridge.ts` and `src/components/world/GameClientFrame.jsx`.
- Never put auth tokens or private profile data into bridge payloads.

`src/worldAudio.ts` owns the first spatial soundscape. It uses PlayCanvas's single `SoundManager` context, binds procedural water, fabric, harmonic beds, and interaction chimes to exact authored SFX marker names, and smooths their gain/pan from the player position and camera heading. The shell sends the persisted `AUDIO_SETTINGS` preference and receives `AUDIO_STATE`; the standalone client exposes the same accessible control locally. Audio is never required for progress and starts only after a trusted gesture inside the game frame.

If the production game is hosted on a separate origin, build it with `VITE_SHELL_ORIGIN` set to the exact React shell origin and set `REACT_APP_GAME_CLIENT_URL` in the shell. Also allow that game origin in the deployed shell's `frame-src` policy. The referrer-derived origin is only a same-origin/local-development fallback.

`moodStudy.ts` is the runtime assembly and progressive-loading layer for the authored Blender kits. It also owns local movement, camera behavior, activity alignment, the Resonance Loom world response, and graceful primitive fallbacks; replace it only when a PlayCanvas Editor export has verified parity for those responsibilities.
