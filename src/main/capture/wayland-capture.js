const { spawn, execSync } = require("child_process");
const BaseCapture = require("./base-capture");
const { FFmpegStartupError } = require("../utils/ffmpeg-manager");

/**
 * Wayland capture via wf-recorder (wlr-screencopy protocol).
 *
 * Stock FFmpeg builds ship no `pipewire` input demuxer, so `-f pipewire`
 * can not capture Wayland screens. wf-recorder (available in the official
 * repositories of every major distribution) supports wlroots-based
 * compositors (Hyprland, Sway, ...) and can stream a matroska to stdout,
 * which we feed into the regular FFmpeg pipeline as the video input.
 * Audio mixing, filters and the final encode stay in base-capture.
 */
class WaylandCapture extends BaseCapture {
  constructor() {
    super();
    // Video is grabbed exactly at this.region by wf-recorder (-g), so the
    // base class must not apply a crop filter on top (double crop).
    this.handlesRegionNatively = true;
    this.recorder = null; // wf-recorder child process
    this.stopping = false;
    this.recorderError = null;
  }

  /**
   * Output layout in GLOBAL compositor coordinates, straight from the
   * compositor. Electron's screen API also reports correct global bounds,
   * but only the compositor knows the output names wf-recorder's -o
   * option expects.
   */
  getOutputs() {
    const isValidOutput = (o) =>
      o &&
      typeof o.name === "string" &&
      Number.isFinite(o.x) &&
      Number.isFinite(o.y) &&
      Number.isFinite(o.width) &&
      Number.isFinite(o.height) &&
      o.width > 0 &&
      o.height > 0;

    try {
      const raw = execSync("hyprctl -j monitors", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("hyprctl output not an array");
      const outputs = parsed
        .map((m) => ({
          name: m.name,
          x: m.x,
          y: m.y,
          width: m.width,
          height: m.height,
        }))
        .filter(isValidOutput);
      if (outputs.length > 0) return outputs;
      console.warn("[WaylandCapture] hyprctl returned no valid outputs, trying swaymsg");
    } catch (e) {
      // Not running Hyprland or invalid output
    }
    try {
      const raw = execSync("swaymsg -t get_outputs -r", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("swaymsg output not an array");
      const outputs = parsed
        .map((o) => ({
          name: o.name,
          x: o.rect.x,
          y: o.rect.y,
          width: o.rect.width,
          height: o.rect.height,
        }))
        .filter(isValidOutput);
      if (outputs.length > 0) return outputs;
    } catch (e) {
      // Not running Sway or invalid output
    }
    return [];
  }


  findOutputForRegion(region) {
    const outputs = this.getOutputs();
    if (outputs.length === 0) {
      console.warn(
        "[WaylandCapture] Could not enumerate outputs; wf-recorder will record the output containing the cursor"
      );
      return null;
    }
    if (!region || region.width <= 0 || region.height <= 0) {
      return null; // fullscreen: let wf-recorder decide
    }
    // Decide by region center so partially overlapping regions resolve
    // deterministically to a single output
    const cx = region.x + region.width / 2;
    const cy = region.y + region.height / 2;
    const output = outputs.find(
      (o) =>
        cx >= o.x &&
        cx < o.x + o.width &&
        cy >= o.y &&
        cy < o.y + o.height
    );
    if (!output) {
      throw new FFmpegStartupError(
        "Capture area is outside screen bounds",
        `region=${JSON.stringify(region)} outputs=${JSON.stringify(outputs)}`
      );
    }
    return output;
  }
  buildRecorderArgs(region) {
    const args = [
      "-D", // record continuously, not only when the screen changes
      "-r", String(this.fps),
      "-c", "libx264",
      "-p", "preset=ultrafast",
      "-p", "crf=0",
      "-m", "matroska",
      // libavformat pipe URL: writes straight to fd 1. "/dev/stdout"
      // fails with avio_open when wf-recorder is spawned from Node.
      "-f", "pipe:1",
    ];
    const output = this.findOutputForRegion(region);
    if (output) {
      args.push("-o", output.name);
    }

    if (region && region.width > 0 && region.height > 0) {
      let x = region.x;
      let y = region.y;
      let width = region.width;
      let height = region.height;

      if (output) {
        // wf-recorder -g takes GLOBAL coordinates (verified on Hyprland:
        // output-local coordinates are rejected as not intersecting any
        // output, which silently falls back to recording the full screen)
        x = Math.max(x, output.x);
        y = Math.max(y, output.y);
        width =
          Math.min(region.x + region.width, output.x + output.width) - x;
        height =
          Math.min(region.y + region.height, output.y + output.height) - y;
      }

      // x264 requires even dimensions — must apply regardless of output
      // (fallback path when compositor unknown would otherwise pass odd size)
      if (width % 2 !== 0) width -= 1;
      if (height % 2 !== 0) height -= 1;

      if (width <= 0 || height <= 0) {
        throw new FFmpegStartupError(
          "Capture area is outside screen bounds or too small after clamping",
          `region=${JSON.stringify(region)} output=${JSON.stringify(output)} clamped=${JSON.stringify({ x, y, width, height })}`
        );
      }

      // Do NOT mutate this.region — that leaks clamped geometry to
      // subsequent recordings and callers holding the original object.
      // The effective rect is used only for this wf-recorder invocation.
      // If metadata needs the actually recorded area, read the -g value
      // or store it in this._effectiveRegion.
      this._effectiveRegion = { x, y, width, height };

      args.push("-g", `${x},${y} ${width}x${height}`);
    }

    return args;
  }

  async buildVideoArgs() {
    // Video comes from wf-recorder through ffmpeg's stdin
    return [
      "-thread_queue_size",
      "4096",
      "-f",
      "matroska",
      "-i",
      "-",
      "-r",
      String(this.fps),
    ];
  }

  async startRecording(outputPath) {
    this.stopping = false;
    this.recorderError = null;
    this._effectiveRegion = null;

    const args = this.buildRecorderArgs(this.region);
    console.log(
      `[WaylandCapture] Starting wf-recorder: wf-recorder ${args.join(" ")}`
    );

    this.recorder = spawn("wf-recorder", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.videoInputStream = this.recorder.stdout;
    // Prevent unhandled error on stdout if FFmpeg dies early
    this.videoInputStream.on("error", () => {});

    let stderr = "";
    this.recorder.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    this.recorder.on("error", (err) => {
      this.recorderError = `wf-recorder could not be started: ${err.message}. Install it with: sudo pacman -S wf-recorder`;
      console.error(`[WaylandCapture] ${this.recorderError}`);
    });

    this.recorder.on("exit", (code, signal) => {
      console.log(
        `[WaylandCapture] wf-recorder exited code=${code} signal=${signal}`
      );
      if (this.stopping) return;
      // Crashed or failed mid-recording: end the FFmpeg pipeline so the
      // output file gets finalized. Must treat signal termination as failure
      // (code is null when killed by signal).
      const failedByCode = code !== 0 && code !== null;
      const failedBySignal = signal !== null;
      if (failedByCode || failedBySignal) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        this.recorderError = `wf-recorder exited unexpectedly with ${reason}. ${stderr.slice(-500)}`;
        console.error(`[WaylandCapture] ${this.recorderError}`);
        if (this.ffmpegManager.isActive()) {
          this.ffmpegManager.kill();
        }
      }
    });

    // Fail-fast if wf-recorder binary missing or exits immediately.
    // Without this, FFmpeg starts with `-i -` and hangs waiting for stdin
    // until its 200ms fallback timeout; error only surfaced on stop.
    const failFastPromise = new Promise((_, reject) => {
      const onError = (err) => {
        // error event already set recorderError above; ensure rejection
        const msg = this.recorderError || `wf-recorder could not be started: ${err.message}`;
        reject(new FFmpegStartupError(msg, stderr));
      };
      const onEarlyExit = (code, signal) => {
        if (this.stopping) return;
        const failedByCode = code !== 0 && code !== null;
        const failedBySignal = signal !== null;
        if (failedByCode || failedBySignal) {
          const reason = signal ? `signal ${signal}` : `code ${code}`;
          const msg = this.recorderError || `wf-recorder exited unexpectedly with ${reason}. ${stderr.slice(-500)}`;
          reject(new FFmpegStartupError(msg, stderr));
        }
      };
      this.recorder.once("error", onError);
      this.recorder.once("exit", onEarlyExit);
    });
    // Prevent unhandled rejection if FFmpeg starts successfully and the
    // early-exit listeners never fire or fire later (mid-recording crash
    // is handled by the persistent 'on' listeners above).
    failFastPromise.catch(() => {});

    try {
      await Promise.race([super.startRecording(outputPath), failFastPromise]);
    } catch (err) {
      // FFmpeg failed to start or wf-recorder failed immediately: do not leave wf-recorder running
      this.stopRecorderProcess();
      throw err;
    }
    return;
  }

  stopRecorderProcess() {
    if (!this.recorder) return;
    const proc = this.recorder;
    this.recorder = null;
    this.videoInputStream = null;
    this._effectiveRegion = null;
    if (proc.exitCode !== null || proc.killed) return;
    try { proc.kill("SIGINT"); } catch {}
    setTimeout(() => {
      if (proc.exitCode === null) {
        try { proc.kill("SIGKILL"); } catch {}
      }
    }, 3000);
  }

  async stopRecording() {
    this.stopping = true;

    if (this.recorderError) {
      const message = this.recorderError;
      this.stopRecorderProcess();
      throw new FFmpegStartupError(message);
    }

    // SIGINT makes wf-recorder finalize the matroska stream; FFmpeg then
    // reaches EOF on its video input and finalizes the output file.
    // Must await actual exit, not just a timeout, otherwise the matroska
    // footer is truncated and a zombie holds the pipe.
    const recorder = this.recorder;
    if (recorder && recorder.exitCode === null && !recorder.killed) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        recorder.once("exit", finish);
        try {
          recorder.kill("SIGINT");
        } catch {
          finish();
          return;
        }
        const t1 = setTimeout(() => {
          if (recorder.exitCode === null) {
            console.warn(
              "[WaylandCapture] wf-recorder did not exit after SIGINT, sending SIGTERM"
            );
            try {
              recorder.kill("SIGTERM");
            } catch {}
            const t2 = setTimeout(() => {
              if (recorder.exitCode === null) {
                console.warn(
                  "[WaylandCapture] wf-recorder did not exit after SIGTERM, sending SIGKILL"
                );
                try {
                  recorder.kill("SIGKILL");
                } catch {}
              }
              // Give SIGKILL a moment to reap, then finish even if still not exited
              setTimeout(finish, 1000);
            }, 2000);
            recorder.once("exit", () => clearTimeout(t2));
          }
        }, 3000);
        recorder.once("exit", () => clearTimeout(t1));
        // Absolute safety fallback — never hang stopRecording forever
        setTimeout(finish, 8000);
      });
    }
    this.recorder = null;
    this.videoInputStream = null;
    this._effectiveRegion = null;

    return super.stopRecording();
  }

}

module.exports = WaylandCapture;
