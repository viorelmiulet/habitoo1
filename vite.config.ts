// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), ""));

export default defineConfig({
  vite: {
    resolve: { alias: {
      "entities/lib/decode.js": path.resolve("node_modules/entities/lib/decode.js"),
      "entities/lib/encode.js": path.resolve("node_modules/entities/lib/encode.js"),
      "entities": path.resolve("node_modules/entities"),
    } },
    // Permite testarea locală a separării de domenii (site public vs subdomeniul CRM).
    server: { allowedHosts: ["habitoo.ro", "www.habitoo.ro", "crm.habitoo.ro"] },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
