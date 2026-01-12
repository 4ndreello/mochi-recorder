## Project Overview

**Mochi** is a Linux-native Electron screen recording application that serves as a Screen Studio alternative. It features smooth cursor overlays, automatic zoom effects, and dual-source audio recording (microphone + system audio). The application is built for X11 and Wayland display servers with graceful fallback mechanisms.

**Key Technologies:**

- Electron 28.0.0 (main + renderer process architecture)
- FFmpeg (auto-downloaded or system binary with fallback logic)
- Canvas 3.2.0 (for 120fps cursor rendering)
- Vitest (unit testing)
- Playwright (e2e testing)

---

## Development Commands

### Installation

```bash
npm install
```

### Running Development Mode

```bash
npm run dev
```

Runs the application in development mode with hot reload.

### Building

```bash
npm run build:linux       # Build AppImage and .deb packages
npm run build:dir        # Build directory (no packaging)
npm run build            # Build with default config
```

### Testing

```bash
npm test                 # Run unit tests (vitest)
npm test:watch          # Run tests in watch mode with hot reload
npm test:coverage       # Generate coverage report
npm test:e2e            # Run end-to-end tests (Playwright)
```

**Unit Tests Structure:**

- Location: `tests/unit/**/*.test.mjs`
- Coverage focuses on `src/main/**/*.js` (excludes main.js and renderer)
- Provider: Vitest with v8 coverage
- Reports: text + HTML output

**E2E Tests Structure:**

- Location: `tests/e2e/**/*.{js,mjs}`
- Framework: Playwright
- Timeout: 60 seconds per test
- Workers: 1 (sequential, required for display server interaction)
- Retries: 1 on failure

---

## Architecture Overview

### High-Level Structure

The application follows an **Electron main + renderer** architecture with clear separation:

- **Main Process** (`src/main/`): Backend logic for capture, processing, system integration
- **Renderer Process** (`src/renderer/`): Frontend UI and IPC bridges

### Core Modules

#### **1. Capture Module** (`src/main/capture/`)

Handles screen recording via display server protocol.

| Component            | Role                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `capture-manager.js` | Orchestrator; detects X11 vs Wayland at runtime                                    |
| `base-capture.js`    | Abstract interface for display server implementations                              |
| `x11-capture.js`     | X11-specific: uses X11 protocol to capture frames, validates region, spawns FFmpeg |
| `wayland-capture.js` | Wayland-specific: handles Wayland protocol complexities                            |

**Key Detail:** Uses environment detection (`env-detector.js`) to choose implementation. No hardcoded assumptions about display server.

#### **2. Events Module** (`src/main/events/`)

Records cursor metadata for overlay generation.

| Component           | Role                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `mouse-tracker.js`  | High-frequency polling (1000Hz target) of cursor position; hooks into display server     |
| `event-recorder.js` | Accumulates events with timestamps; adjusts for FFmpeg startup delay; serializes to JSON |

**Output:** `metadata.json` file with event stream used by post-processor.

#### **3. Processing Module** (`src/main/processing/`)

Post-recording video composition pipeline.

| Component                   | Role                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `video-processor.js`        | Main orchestrator; reads metadata; decides processing pipeline (cursor overlay yes/no)            |
| `cursor-video-generator.js` | Renders cursor as separate 120fps video using Canvas; applies motion blur; loads Apple cursor SVG |
| `cursor-renderer.js`        | Per-frame cursor drawing (shadow, click animations)                                               |
| `zoom-analyzer.js`          | Analyzes cursor movement patterns (for future auto-zoom feature)                                  |

**Pipeline:** Raw video → (if cursor overlay enabled) generate 120fps cursor overlay → FFmpeg composite → final MP4

#### **4. UI Module** (`src/main/ui/`)

User-facing windows and system integration.

| Component                   | Role                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `area-selector.js`          | Multi-monitor support; creates fullscreen windows per display; drag-to-select region         |
| `recording-overlay.js`      | Visual border around recording region; start/stop/rerecord controls; intelligent positioning |
| `post-recording-dialog.js`  | Results dialog; options to save, upload, or rerecord                                         |
| `tray-manager.js`           | System tray integration; provides quick access menu                                          |
| `floating-button.js`        | Quick action button for fast recording access                                                |
| `ffmpeg-download-window.js` | First-run setup; FFmpeg binary download with progress                                        |
| `update-manager.js`         | Periodic checks via electron-updater; notifies on new releases                               |

#### **5. Utilities Module** (`src/main/utils/`)

Infrastructure and configuration services.

| Component              | Role                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `ffmpeg-manager.js`    | Spawns FFmpeg processes; constructs arguments; error detection                                            |
| `binary-resolver.js`   | Binary resolution with fallback: system PATH → downloaded binary → error                                  |
| `env-detector.js`      | Detects display server (X11/Wayland); detects audio backend (PulseAudio/ALSA); auto-detects audio devices |
| `settings-manager.js`  | Persists user preferences to `~/.config/mochi/settings.json` (FPS, quality, toggles)                      |
| `ffmpeg-downloader.js` | Downloads pre-compiled FFmpeg to `~/.config/mochi/bin/ffmpeg`                                             |

#### **6. Upload Module** (`src/main/upload/`)

Cloud integration.

| Component            | Role                                              |
| -------------------- | ------------------------------------------------- |
| `catbox-uploader.js` | Uploads processed video to Catbox hosting service |

### Data Flow: Recording Lifecycle

```
START RECORDING
  → CaptureManager detects environment (X11/Wayland)
  → MouseTracker + EventRecorder initialized
  → FFmpeg spawns, captures video frame-by-frame
  → MouseTracker samples at 1000Hz, EventRecorder buffers events

STOP RECORDING
  → FFmpeg process terminates
  → EventRecorder writes metadata.json
  → VideoProcessor loads metadata + raw video
  → IF cursor overlay enabled: CursorVideoGenerator creates 120fps overlay
  → FFmpeg composites base + overlay → final MP4
  → Post-recording dialog shown
```

### Key Architectural Patterns

1. **Strategy Pattern (Capture):** `CaptureManager` delegates to X11 or Wayland implementation
2. **Factory Pattern (Binaries):** `BinaryResolver` handles complex fallback logic
3. **Observer Pattern (Events):** MouseTracker emits, EventRecorder subscribes
4. **Pipeline Pattern (Processing):** VideoProcessor orchestrates transformation stages
5. **Singleton-like Pattern (Managers):** TrayManager, SettingsManager maintain single instances

### Critical State in main.js

```javascript
isRecording; // Current recording state
isStartingRecording; // Transitional state during FFmpeg startup
recordingStartTime; // For duration calculation
selectedRegion; // User-selected bounds {x, y, width, height}
recordingSettings; // {fps, quality, cursor, microphone, systemAudio}
videoPath; // Temp raw video location
metadataPath; // Temp event metadata JSON
```

State transitions are carefully managed to prevent race conditions during rapid start/stop sequences.

---

## Important Implementation Details

### FFmpeg Binary Strategy

The application prioritizes flexibility:

1. **Check system PATH first** (prefers system FFmpeg for codec/device support)
2. **Fall back to downloaded binary** at `~/.config/mochi/bin/ffmpeg`
3. **Download on-demand** (~40MB) if neither found
4. **Can force system binary** via `--force-system-binary` flag

**Code Location:** `binary-resolver.js:15-45` (priority logic)

### Audio Backend Detection

Auto-detects available audio backends and microphone/system audio:

- **PulseAudio** (preferred): Offers better device enumeration
- **ALSA** (fallback): Direct ALSA input if PulseAudio unavailable

**Code Location:** `env-detector.js:35-80` (detection logic)

### Multi-Monitor Support

Area selector creates fullscreen windows on each connected display:

- Respects per-monitor scaling factors
- Converts selection to absolute screen coordinates
- Intelligently positions controls to fit selection bounds

**Code Location:** `area-selector.js:20-60` (window creation) and `recording-overlay.js:90-120` (positioning logic)

### High-Precision Cursor Rendering

The cursor overlay is generated at **120fps** (vs base 30-60fps video):

- Separate Canvas-based video stream
- Loads Apple cursor SVG, scales to resolution
- Applies motion blur for smooth interpolation
- Composited via FFmpeg filter_complex overlay

**Code Location:** `cursor-video-generator.js:15-70` (generation) and `cursor-renderer.js:20-50` (per-frame drawing)

### Metadata-Driven Processing

Events are stored as JSON with relative timestamps:

```json
[
  { "type": "move", "x": 100, "y": 200, "time": 0 },
  { "type": "mousedown", "button": 1, "x": 100, "y": 200, "time": 1000 },
  { "type": "mouseup", "button": 1, "x": 100, "y": 200, "time": 1050 }
]
```

Timestamps are **relative to video start** (adjusted for FFmpeg startup delay). This enables future features like timeline editing or playback analytics.

**Code Location:** `event-recorder.js:55-75` (timestamp adjustment)

---

## IPC Communication Patterns

Main process exposes:

**Async Handlers:**

- `get-recording-status`: Returns current recording state
- `get-settings`: Fetches persisted user preferences
- `ffmpeg-check-installation`: Validates FFmpeg availability

**Events (Main → Renderer):**

- `stop-recording-clicked`: User pressed stop in overlay
- `rerecord-clicked`: User requested another take
- `region-changed`: Selection region updated
- `processing-progress`: Video processing updates (0-100%)

**Events (Renderer → Main):**

- `start-recording-request`: User initiated capture
- `settings-changed`: User modified preferences

---

## Common Development Tasks

### Adding a New Capture Backend (e.g., for future display server)

1. Create `src/main/capture/my-capture.js` extending `BaseCap2024ture`
2. Implement required methods: `startRecording()`, `stopRecording()`, `validateRegion()`
3. Update `capture-manager.js` to detect and instantiate your backend
4. Add environment detection in `env-detector.js` if needed
5. Write unit tests in `tests/unit/capture/my-capture.test.mjs`

### Adding a New Post-Processing Effect

1. Create processing module in `src/main/processing/my-effect.js`
2. Export a function that takes `{videoPath, metadata, settings}` and returns Promise
3. Call from `video-processor.js` in the pipeline
4. Add UI option in `post-recording-dialog.js` if user-configurable

### Modifying FFmpeg Arguments

FFmpeg arguments are constructed in capture implementations:

- **X11:** `src/main/capture/x11-capture.js:130-160`
- **Wayland:** `src/main/capture/wayland-capture.js:130-160`

Changes here affect all recordings. Test on both display servers.

### Testing Display Server Interactions

E2E tests use Playwright to verify UI and capture flow:

```bash
npm test:e2e
```

Running E2E tests requires an active X11 or Wayland session. Tests run sequentially (workers=1) due to display server exclusivity.

---

## File Organization

```
src/main/
├── main.js                           # Entry point; IPC coordination
├── capture/                          # Screen capture backends
│   ├── capture-manager.js
│   ├── base-capture.js
│   ├── x11-capture.js
│   └── wayland-capture.js
├── events/                           # Event tracking
│   ├── mouse-tracker.js
│   └── event-recorder.js
├── processing/                       # Post-recording pipeline
│   ├── video-processor.js
│   ├── cursor-video-generator.js
│   ├── cursor-renderer.js
│   └── zoom-analyzer.js
├── ui/                               # Windows and dialogs
│   ├── area-selector.js
│   ├── recording-overlay.js
│   ├── post-recording-dialog.js
│   ├── tray-manager.js
│   ├── floating-button.js
│   ├── ffmpeg-download-window.js
│   └── update-manager.js
├── upload/                           # Cloud services
│   └── catbox-uploader.js
└── utils/                            # Infrastructure
    ├── ffmpeg-manager.js
    ├── binary-resolver.js
    ├── env-detector.js
    ├── settings-manager.js
    └── ffmpeg-downloader.js

src/renderer/
├── renderer.js                       # IPC bridge
├── *.html                            # UI templates
├── styles.css                        # Global styles
├── components/
│   └── FFmpegDownloadModal.js        # Download UI
└── assets/
    ├── icon.png
    ├── apple-cursor.svg              # Cursor graphic
    └── apple-cursor.png

tests/
├── unit/                             # Vitest unit tests
│   └── **/*.test.mjs
└── e2e/                              # Playwright integration tests
    └── **/*.spec.mjs
```

---

## Troubleshooting & Debugging

### FFmpeg Issues

- **"FFmpeg not found":** Verify `binary-resolver.js` fallback chain. Check `~/.config/mochi/bin/ffmpeg` exists and is executable.
- **Encoding errors:** Check FFmpeg arguments in capture implementations. Test command manually: `ffmpeg -i input.mp4 -c:v libx264 output.mp4`
- **Force system binary:** `npm run dev -- --force-system-binary`

### Display Server Detection Failures

- **Verify environment:** Check `env-detector.js` detection logic
- **Debug output:** Add console.logs to `CaptureManager.detectEnvironment()` and restart dev mode
- **Test detection:** `npm test src/main/utils/env-detector.test.mjs`

### Cursor Overlay Not Rendering

- **Check metadata:** Verify `metadata.json` exists in temp directory (check in post-recording logs)
- **Verify Canvas:** Test `cursor-video-generator.js` in isolation
- **Debug SVG loading:** Check `apple-cursor.svg` path in `cursor-renderer.js`

### Multi-Monitor Issues

- **Verify displays:** Run `xrandr` (X11) or `wayland-info` (Wayland)
- **Check positioning:** Add logs to `area-selector.js:50-80` (window creation per display)
- **Test control placement:** Review `recording-overlay.js:90-120` (intelligent positioning)

---

## Performance Notes

- **MouseTracker polling:** Targets 1000Hz; tune in `mouse-tracker.js` if CPU usage high
- **Cursor rendering:** 120fps generation with motion blur; can be reduced to 60fps in `cursor-video-generator.js` if needed
- **FFmpeg encoding:** Quality presets (Low/Medium/High) map to CRF values; adjust in capture implementations if needed
- **Metadata JSON:** Events accumulated in memory; consider streaming to disk for very long recordings (>1 hour)

---

## TypeScript Usage

This is a **JavaScript-only codebase** (no TypeScript). However, the user instructions prohibit using `as any` in TypeScript code, which is not applicable here. If TypeScript is introduced in the future, ensure type safety without `as any` escape hatches.

---

## Release & Distribution

Builds are automated via electron-builder:

```bash
npm run build:linux  # Creates AppImage + .deb in dist/
```

Releases are published to GitHub via `electron-updater` (configured in package.json `build.publish`). The app checks for updates periodically via `update-manager.js`.

License: MIT (but distributes FFmpeg which is GPLv3—ensure both licenses are included in releases)
