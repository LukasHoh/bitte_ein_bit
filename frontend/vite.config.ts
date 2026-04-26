// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// #region agent log
fetch("http://127.0.0.1:7620/ingest/1d44f487-fdc9-42d1-9aa3-417ee6329b35",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"b89e1e"},body:JSON.stringify({sessionId:"b89e1e",runId:"pre-fix",hypothesisId:"H3",location:"frontend/vite.config.ts:9",message:"vite config top-level reached",data:{node:process.version},timestamp:Date.now()})}).catch(()=>{});
// #endregion

// DuckDB ships native `.node` binaries through `@duckdb/node-bindings*`. Vite's
// dep optimizer (esbuild) chokes on those, even though the imports only happen
// inside `*.server.ts` files. Marking the DuckDB packages as external on every
// build target lets Node resolve them at runtime.
const DUCKDB_EXTERNALS = [
  "@duckdb/node-api",
  "@duckdb/node-bindings",
  "@duckdb/node-bindings-linux-x64",
  "@duckdb/node-bindings-linux-arm64",
  "@duckdb/node-bindings-darwin-x64",
  "@duckdb/node-bindings-darwin-arm64",
  "@duckdb/node-bindings-win32-x64",
  "@duckdb/node-bindings-win32-arm64",
];

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: DUCKDB_EXTERNALS,
    },
    ssr: {
      external: DUCKDB_EXTERNALS,
    },
    build: {
      rollupOptions: {
        external: DUCKDB_EXTERNALS,
      },
    },
  },
});
