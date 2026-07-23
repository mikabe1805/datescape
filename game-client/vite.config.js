import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/game/",
  css: {
    // The game client has no Tailwind dependency and should not inherit the
    // legacy React shell's PostCSS configuration.
    postcss: { plugins: [] },
  },
  build: {
    outDir: fileURLToPath(new URL("../public/game", import.meta.url)),
    emptyOutDir: true,
    target: "es2020",
  },
});
