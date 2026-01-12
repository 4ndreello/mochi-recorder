const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const BinaryResolver = require("./binary-resolver");

const FATAL_ERROR_PATTERNS = [
  { pattern: /outside the screen size/i, message: "Capture area is outside screen bounds" },
  { pattern: /Invalid argument/i, message: "Invalid FFmpeg argument" },
  { pattern: /not divisible by 2/i, message: "Video dimensions must be even numbers" },
  { pattern: /No such file or directory/i, message: "File or device not found" },
  { pattern: /Permission denied/i, message: "Permission denied" },
  { pattern: /Device or resource busy/i, message: "Device is busy" },
  { pattern: /Cannot open display/i, message: "Cannot open X11 display" },
  { pattern: /Connection refused/i, message: "Connection refused" },
];

class FFmpegStartupError extends Error {
  constructor(message, ffmpegOutput = "") {
    super(message);
    this.name = "FFmpegStartupError";
    this.ffmpegOutput = ffmpegOutput;
  }
}

class FFmpegManager extends EventEmitter {
  constructor(label = "FFmpeg") {
    super();
    this.process = null;
    this.label = label;
    this.isRunning = false;
    this.errorOutput = "";
    this.ffmpegPath = null;
  }

  static detectFatalError(output) {
    for (const { pattern, message } of FATAL_ERROR_PATTERNS) {
      if (pattern.test(output)) {
        return message;
      }
    }
    return null;
  }

  async start(args) {
    return new Promise(async (resolve, reject) => {
      if (this.isRunning) {
        reject(new FFmpegStartupError(`[${this.label}] FFmpeg process already running`));
        return;
      }

      try {
        console.log(`[MAIN] [${this.label}] Resolving FFmpeg binary path...`);
        this.ffmpegPath = await BinaryResolver.getFFmpegPath();
        console.log(`[MAIN] [${this.label}] Using FFmpeg: ${this.ffmpegPath}`);
      } catch (err) {
        console.error(`[MAIN] [${this.label}] Failed to resolve FFmpeg binary: ${err.message}`);
        reject(new FFmpegStartupError(`[${this.label}] Failed to resolve FFmpeg binary: ${err.message}`));
        return;
      }

      console.log(`[MAIN] [${this.label}] Starting FFmpeg with args:`, args.join(" "));

      this.process = spawn(this.ffmpegPath, args);
      this.isRunning = true;
      this.errorOutput = "";

      let hasRejected = false;
      let hasResolved = false;
      let startupTimeout = null;

      const rejectOnce = (error) => {
        if (!hasRejected && !hasResolved) {
          hasRejected = true;
          this.isRunning = false;
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          reject(error);
        }
      };

      const resolveOnce = () => {
        if (!hasResolved && !hasRejected) {
          hasResolved = true;
          if (startupTimeout) {
            clearTimeout(startupTimeout);
          }
          console.log(`[MAIN] [${this.label}] FFmpeg started successfully`);
          resolve();
        }
      };

      this.process.on("error", (error) => {
        console.error(`[MAIN] [${this.label}] FFmpeg spawn error:`, error);
        this.emit("error", error);
        rejectOnce(new FFmpegStartupError(`FFmpeg spawn error: ${error.message}`));
      });

      this.process.stderr.on("data", (data) => {
        const output = data.toString();
        this.errorOutput += output;
        this.emit("stderr", output);

        const fatalError = FFmpegManager.detectFatalError(output);
        if (fatalError) {
          console.error(`[MAIN] [${this.label}] Fatal FFmpeg error detected: ${fatalError}`);
          rejectOnce(new FFmpegStartupError(fatalError, this.errorOutput));
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
          return;
        }

        // Resolve immediately when FFmpeg starts encoding frames
        if (output.includes("frame=") || output.includes("time=")) {
          this.emit("progress", output);
          resolveOnce();
        }
      });

      this.process.stdout.on("data", (data) => {
        this.emit("stdout", data.toString());
      });

      this.process.on("close", (code, signal) => {
        console.log(
          `[MAIN] [${this.label}] FFmpeg closed with code ${code}, signal ${signal}`
        );
        this.isRunning = false;
        this.process = null;
        this.emit("close", code, signal);

        if (!hasRejected && !hasResolved && code !== 0 && code !== null) {
          rejectOnce(new FFmpegStartupError(
            `FFmpeg exited with code ${code}`,
            this.errorOutput
          ));
        }
      });

      // Fallback timeout - reduced from 500ms to 200ms
      // This only triggers if FFmpeg doesn't output frame= or time= quickly
      startupTimeout = setTimeout(() => {
        if (hasRejected || hasResolved) return;
        
        if (this.isRunning && this.process && !this.process.killed) {
          resolveOnce();
        } else if (!hasRejected) {
          rejectOnce(new FFmpegStartupError(`[${this.label}] FFmpeg did not start correctly`));
        }
      }, 200);

      this.process.on("exit", () => {
        if (startupTimeout) {
          clearTimeout(startupTimeout);
        }
      });
    });
  }

  /**
   * Stops FFmpeg gracefully using SIGINT to allow proper file finalization.
   * preStopDelay ensures audio buffers are captured before stopping.
   * Falls back to SIGTERM/SIGKILL if process doesn't respond.
   */
  async stop(options = {}) {
    const { gracePeriod = 10000, preStopDelay = 0 } = options;

    return new Promise((resolve) => {
      if (!this.process || !this.isRunning) {
        console.log(`[MAIN] [${this.label}] No FFmpeg process to stop`);
        resolve();
        return;
      }

      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.isRunning = false;
          this.process = null;
          resolve();
        }
      };

      this.process.on("close", (code) => {
        console.log(`[MAIN] [${this.label}] FFmpeg stopped with code ${code}`);
        cleanup();
      });

      console.log(
        `[MAIN] [${this.label}] Waiting ${preStopDelay}ms before stopping to flush audio buffers...`
      );

      setTimeout(() => {
        if (!this.process || resolved) {
          cleanup();
          return;
        }

        console.log(`[MAIN] [${this.label}] Sending SIGINT to FFmpeg...`);
        this.process.kill("SIGINT");

        const graceTimeout = setTimeout(() => {
          if (this.process && !resolved) {
            console.warn(
              `[MAIN] [${this.label}] FFmpeg did not respond to SIGINT, sending SIGTERM...`
            );
            this.process.kill("SIGTERM");

            setTimeout(() => {
              if (this.process && !resolved) {
                console.warn(
                  `[MAIN] [${this.label}] Force killing FFmpeg with SIGKILL...`
                );
                this.process.kill("SIGKILL");
                cleanup();
              }
            }, 2000);
          }
        }, gracePeriod);

        this.process.once("close", () => {
          clearTimeout(graceTimeout);
        });
      }, preStopDelay);
    });
  }

  kill() {
    if (this.process) {
      console.warn(`[MAIN] [${this.label}] Force killing FFmpeg process`);
      this.process.kill("SIGKILL");
      this.isRunning = false;
      this.process = null;
    }
  }

  async run(args) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`[MAIN] [${this.label}] Resolving FFmpeg binary path...`);
        this.ffmpegPath = await BinaryResolver.getFFmpegPath();
        console.log(`[MAIN] [${this.label}] Using FFmpeg: ${this.ffmpegPath}`);
      } catch (err) {
        console.error(`[MAIN] [${this.label}] Failed to resolve FFmpeg binary: ${err.message}`);
        reject(new Error(`[${this.label}] Failed to resolve FFmpeg binary: ${err.message}`));
        return;
      }

      console.log(`[MAIN] [${this.label}] Running FFmpeg command:`, args.join(" "));

      const process = spawn(this.ffmpegPath, args);
      let errorOutput = "";

      process.stderr.on("data", (data) => {
        const output = data.toString();
        errorOutput += output;
        this.emit("stderr", output);

        if (output.includes("time=")) {
          this.emit("progress", output);
        }
      });

      process.on("close", (code) => {
        if (code === 0) {
          console.log(`[MAIN] [${this.label}] FFmpeg command completed successfully`);
          resolve();
        } else {
          console.error(`[MAIN] [${this.label}] FFmpeg failed with code ${code}`);
          console.error(`[MAIN] [${this.label}] Error output:`, errorOutput.substring(0, 500));
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput.substring(0, 200)}`));
        }
      });

      process.on("error", (error) => {
        console.error(`[MAIN] [${this.label}] FFmpeg spawn error:`, error);
        reject(error);
      });
    });
  }

  isActive() {
    return this.isRunning && this.process && !this.process.killed;
  }

  getErrorOutput() {
    return this.errorOutput;
  }
}

module.exports = FFmpegManager;
module.exports.FFmpegStartupError = FFmpegStartupError;
module.exports.FATAL_ERROR_PATTERNS = FATAL_ERROR_PATTERNS;
