Purpose
Provide concise, repo-specific guidance so an AI coding agent can be immediately productive

Big picture
- This workspace is split into two main components: `web_cad_core` (Rust, Wasm) and `web_cad_frontend` (TypeScript + Vite). See README.md for high-level context.
- `web_cad_core` builds a Wasm module (wasm-pack) that exports an `eframe`/`egui` driven app (`WebCadApp` in `web_cad_core/src/lib.rs`). The app exposes `set_active_tool()` via `wasm_bindgen` to receive tool/GUI events from the JS side.
- `web_cad_frontend` loads the generated Wasm JS/DTS in `web_cad_frontend/src/pkg` and runs a Vite dev server (`npm run dev`). The frontend acts as the host and UI glue for the Wasm engine.

Key developer workflows (exact commands)
- Build the Wasm module and copy it into the frontend package directory (canonical out-dir used in README):
  - From repo root:
    - cd web_cad_core
    - wasm-pack build --target web --out-dir ../web_cad_frontend/src/pkg
  - For production builds add `--release`.
- Start the frontend dev server:
  - cd web_cad_frontend
  - npm install
  - npm run dev
- Frontend build (production): `npm run build` (runs `tsc && vite build` per package.json)

Essential files to inspect
- `web_cad_core/src/lib.rs` — central Rust app (`WebCadApp`), rendering logic, `start()` entrypoint, `set_active_tool()` wasm bridge.
- `web_cad_frontend/src/main.ts` — how the frontend imports and calls into the Wasm package (look for the `pkg` import and DOM mount points).
- `web_cad_frontend/package.json` — dev scripts: `dev`, `build`, `preview`.
- `web_cad_frontend/src/pkg` — generated Wasm JS and `.d.ts` files. Regenerate these when changing Rust API.

Project-specific patterns and conventions
- The Rust side uses `eframe::egui` for immediate-mode UI and draws the CAD canvas directly in Rust; the TS side is thin glue that calls exported wasm functions and manages HTML UI controls.
- Tool sync is implemented by a global `ACTIVE_TOOL` Mutex in Rust and `wasm_bindgen` function `set_active_tool()` — when changing frontend controls update that export rather than trying to mutate internal Rust state directly.
- Generated Wasm artifacts are expected under `web_cad_frontend/src/pkg`. Always run `wasm-pack build` with that `--out-dir` before running the dev server after native changes.
- The crate exposes typed declarations (`web_cad_core.d.ts`) that the frontend relies on — keep those in sync.

Debugging notes
- If the app fails to load: open browser devtools → Console/Network. Common causes:
  - Missing or stale files in `web_cad_frontend/src/pkg` (re-run `wasm-pack build`).
  - MIME / 404 for `.wasm` — Vite usually handles this; confirm the `.wasm` file is present in `src/pkg` and `npm run dev` serves it.
  - Observe `console.log` calls emitted by `set_active_tool()` in `lib.rs` for messages from JS.
- For Rust panics in wasm, `console_error_panic_hook` is already set in `start()`; look at browser console for panic traces.

PR / contributor checklist (agent checklist)
- When changing Rust APIs: run `wasm-pack build --target web --out-dir ../web_cad_frontend/src/pkg` and commit the updated files under `web_cad_frontend/src/pkg` so the frontend can type-check and run.
- Run the frontend dev server locally: `cd web_cad_frontend && npm install && npm run dev` and confirm the canvas mounts at the expected DOM id (`cad-canvas`).

What to avoid (observed pitfalls)
- Don’t edit generated files in `src/pkg` manually—regenerate from Rust. If you need an API change, change Rust and regenerate.
- Avoid assuming tests exist — this repo currently relies on manual dev runs (no automated test suite detected).

If anything above is unclear or you want this tailored to a specific role (e.g., test-writer, refactor agent, release packager), tell me which role and I will adapt or expand sections with concrete examples.
