# Agent Guidelines for Mochi (Linux Screen Recorder)

Mochi is an Electron-based screen recording tool for Linux, inspired by Screen Studio, featuring automatic zoom and high-quality capture on both X11 and Wayland.

## 🛠 Commands

### Development & Build
- `npm install`: Install dependencies.
- `npm run dev`: Start the application in development mode with `--dev` flag.
- `npm start`: Start the application in production mode.
- `npm run build:linux`: Build the application for Linux (AppImage and .deb).
- `npm run build:dir`: Build the application directory without packaging.

### Testing
- `npm test`: Run unit tests (Vitest).
- `npm run test:watch`: Run unit tests in watch mode.
- `npm run test:coverage`: Run unit tests with coverage report.
- `npm run test:e2e`: Run E2E/visual tests (Playwright).

#### Test Structure
```
tests/
├── unit/                    # Unit tests (Vitest)
│   └── processing/
│       └── zoom-analyzer.test.mjs
└── e2e/                     # E2E/Visual tests (Playwright)
    ├── app-launch.test.mjs
    ├── area-selector.test.mjs
    ├── recording-overlay.test.mjs
    ├── full-flow.test.mjs
    └── ui-structure.test.mjs
```

#### Writing Tests
- **Unit Tests**: Use Vitest with ESM syntax (`.mjs` files). Import CommonJS modules using `createRequire`.
- **E2E Tests**: Use Playwright with `_electron` API for Electron-specific tests, or `chromium` for HTML-only validation.
- Test files should mirror the source structure where applicable.

## 🏗 Architecture & Patterns

- **Process Separation**: strictly separate Main process (`src/main/`) and Renderer process (`src/renderer/`).
- **Communication**: Use `ipcMain` and `ipcRenderer` for inter-process communication.
- **Environment Detection**: Use `src/main/utils/env-detector.js` to handle X11 vs Wayland logic.
- **Capture Abstraction**: Use `CaptureManager` to delegate to `X11Capture` or `WaylandCapture`.
- **Video Processing**: FFmpeg is the core engine for recording and post-processing (zoom effects).

## 🎨 Code Style & Conventions

### JavaScript / Typescript
- **Modules**: Use CommonJS (`require` / `module.exports`) as currently implemented in the JS files.
- **Naming**: 
  - Classes: `PascalCase` (e.g., `CaptureManager`).
  - Variables/Functions: `camelCase` (e.g., `isRecording`, `startCapture`).
  - Files: `kebab-case` (e.g., `video-processor.js`).
- **Typing**: If migrating to TypeScript, **NEVER** use `as any`. Always define proper interfaces or use generics.
- **Asynchrony**: Use `async/await` instead of raw Promises or callbacks where possible.

### Imports
- Group imports: Built-in modules (path, fs), Electron modules, then local modules.
- Use relative paths for local modules.

### Error Handling
- Wrap critical operations (FFmpeg spawning, File I/O, IPC handles) in `try/catch`.
- Provide meaningful feedback to the user via the `recordingOverlay` or `alert` in renderer.

### UI & Styling
- **CSS**: Located in `src/renderer/styles.css`. Use descriptive class names.
- **HTML**: Modular HTML files for different overlays (e.g., `area-selector.html`, `recording-controls.html`).

### Logging
- Use `console.log` with a process prefix:
  - `console.log("[MAIN] ...")` for Main process.
  - `console.log("[RENDERER] ...")` for Renderer process.

## 📋 Best Practices for Agents
1. **FFmpeg Handling**: Always ensure `ffmpeg` processes are killed/cleaned up if the app crashes or stops.
2. **Wayland Support**: Be mindful that Wayland capture (via PipeWire/Portal) behaves differently than X11.
3. **Paths**: Use `app.getPath('temp')` for raw recordings and `app.getPath('downloads')` for final output.
4. **Modularity**: Keep processing logic (zoom, mouse tracking) decoupled from UI logic.
5. **Testing**: Run `npm test` for unit tests and `npm run test:e2e` for visual/E2E tests before committing.
