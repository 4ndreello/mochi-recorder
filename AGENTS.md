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
*Note: Currently, there are no automated tests implemented. When adding tests, follow these patterns:*
- **Single Test**: `npx jest path/to/file.test.js` (if Jest is added).
- **All Tests**: `npm test`.

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
