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
    try {
      const raw = execSync("hyprctl -j monitors", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return JSON.parse(raw).map((m) => ({
        name: m.name,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
      }));
    } catch (e) {
      // Not running Hyprland
    }
    try {
      const raw = execSync("swaymsg -t get_outputs -r", {
        encoding: "utf-8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return JSON.parse(raw).map((o) => ({
        name: o.name,
        x: o.rect.x,
        y: o.rect.y,
        width: o.rect.width,
        height: o.rect.height,
      }));
    } catch (e) {
      // Not running Sway
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

  /**
   * Builds the wf-recorder command line. Video is encoded losslessly
   * (x264 crf=0 ultrafast) into a matroska stream on stdout; the final
   * encode with the user's quality settings happens in FFmpeg.
   */
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

        // x264 requires even dimensions
        if (width % 2 !== 0) width -= 1;
        if (height % 2 !== 0) height -= 1;

        // Keep this.region in sync so metadata and cursor rendering see
        // the actually recorded area
        this.region = { x, y, width, height };
      }

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

    const args = this.buildRecorderArgs(this.region);
    console.log(
      `[WaylandCapture] Starting wf-recorder: wf-recorder ${args.join(" ")}`
    );

    this.recorder = spawn("wf-recorder", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.videoInputStream = this.recorder.stdout;

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
      // output file gets finalized
      if (code !== 0 && code !== null) {
        this.recorderError = `wf-recorder exited unexpectedly with code ${code}. ${stderr.slice(-500)}`;
        console.error(`[WaylandCapture] ${this.recorderError}`);
        if (this.ffmpegManager.isActive()) {
          this.ffmpegManager.kill();
        }
      }
    });

    try {
      return await super.startRecording(outputPath);
    } catch (err) {
      // FFmpeg failed to start: do not leave wf-recorder running
      this.stopRecorderProcess();
      throw err;
    }
  }

  stopRecorderProcess() {
    if (!this.recorder) return;
    const proc = this.recorder;
    this.recorder = null;
    this.videoInputStream = null;
    if (proc.exitCode !== null || proc.killed) return;
    proc.kill("SIGINT");
    setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
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
    const recorder = this.recorder;
    if (recorder && recorder.exitCode === null) {
      await new Promise((resolve) => {
        recorder.once("exit", resolve);
        recorder.kill("SIGINT");
        setTimeout(() => {
          if (recorder.exitCode === null) {
            console.warn(
              "[WaylandCapture] wf-recorder did not exit after SIGINT, sending SIGTERM"
            );
            recorder.kill("SIGTERM");
          }
          setTimeout(resolve, 2000);
        }, 3000);
      });
    }
    this.recorder = null;
    this.videoInputStream = null;

    return super.stopRecording();
  }
}

module.exports = WaylandCapture;
