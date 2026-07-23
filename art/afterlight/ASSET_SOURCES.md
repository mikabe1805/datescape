# Afterlight asset sources

This ledger records the provenance of art that is allowed into production. Add an entry before importing any third-party asset.

## Environment lighting

### Belfast Sunset - Pure Sky

- Creator/source: Poly Haven
- Source page: https://polyhaven.com/a/belfast_sunset_puresky
- Source file: `environment/belfast_sunset_puresky_1k.hdr`
- Source MD5: `38890f597727936a44d17a97f7f73354`
- License: CC0 1.0 (https://polyhaven.com/license)
- Production derivative: six 512 px RGBE HDR cubemap faces generated with the official PlayCanvas Texture Tool
- PlayCanvas cubemap asset: `Afterlight — Belfast Blue Hour.png` (`298606109`)
- Intended use: visible blue-hour sky, reflections, and image-based lighting

## Original DateScape art

The Arrival Conservatory modular kit in `arrival_conservatory/` is project-original geometry generated from the checked-in Blender source script. It contains no third-party meshes or textures.

## Generated project branding

### Afterlight app icon

- Creator/source: OpenAI built-in image generation, directed for DateScape on July 19, 2026
- Source file: `branding/afterlight-app-icon.source.png`
- Production derivatives: `public/afterlight-icon-32.png`, `public/afterlight-icon-180.png`, `public/afterlight-icon-192.png`, and `public/afterlight-icon-512.png`
- Intended use: browser favicon, install icon, notification icon, and compact Afterlight empty-state mark
- Prompt direction: a centered premium game/app emblem on a deep teal rounded-square field, with two sea-glass and amber paths meeting across a blue-hour horizon; grounded in the three authored district preview renders; no text, heart, people, dating-app clichés, watermark, or mockup frame

## Rejected studies

`Blue Lagoon Night` was tested as an environment reference, rejected because its photographed lamps and shoreline competed with the authored world, and removed from the PlayCanvas project. It is not a production dependency.
