const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const BinaryResolver = require("./binary-resolver");

/**
 * FFmpegManager - Centralized FFmpeg process management
 *
 * Handles spawning, monitoring, and graceful termination of FFmpeg processes.
 * Designed to fix audio cutting issues by ensuring proper buffer flushing
 * before process termination.
 *
 * @param {string} label - Label for logging (e.g., "Recording", "Processing")
 *
 * @method start(args) - Starts FFmpeg process, returns Promise<void>
 * @method stop(options) - Graceful shutdown with SIGINT, options: { gracePeriod, preStopDelay }
 * @method run(args) - Runs FFmpeg command to completion, returns Promise<void>
 * @method kill() - Force kills FFmpeg process (emergency only)
 * @method isActive() - Returns boolean if process is running
 * @method getErrorOutput() - Returns accumulated stderr output
 *
 * @emits stderr - FFmpeg stderr output
 * @emits progress - Progress updates (frame=, time=)
 * @emits close - Process closed (code, signal)
 * @emits error - Process error
 */
class FFmpegManager extends EventEmitter {
  constructor(label = "FFmpeg") {
    super();
    this.process = null;
    this.label = label;
    this.isRunning = false;
    this.errorOutput = "";
    this.ffmpegPath = null;
  }

  async start(args) {
    return new Promise(async (resolve, reject) => {
      if (this.isRunning) {
        reject(new Error(`[${this.label}] FFmpeg process already running`));
        return;
      }

      try {
        console.log(`[MAIN] [${this.label}] Resolving FFmpeg binary path...`);
        this.ffmpegPath = await BinaryResolver.getFFmpegPath();
        console.log(`[MAIN] [${this.label}] Using FFmpeg: ${this.ffmpegPath}`);
      } catch (err) {
        console.error(`[MAIN] [${this.label}] Failed to resolve FFmpeg binary: ${err.message}`);
        reject(new Error(`[${this.label}] Failed to resolve FFmpeg binary: ${err.message}`));
        return;
      }

      console.log(`[MAIN] [${this.label}] Starting FFmpeg with args:`, args.join(" "));

      this.process = spawn(this.ffmpegPath, args);
      this.isRunning = true;
      this.errorOutput = "";

      let hasError = false;
      let startupTimeout = null;

      this.process.on("error", (error) => {
        console.error(`[MAIN] [${this.label}] FFmpeg spawn error:`, error);
        this.isRunning = false;
        this.emit("error", error);
        reject(error);
      });

      this.process.stderr.on("data", (data) => {
        const output = data.toString();
        this.errorOutput += output;

        this.emit("stderr", output);

        if (
          output.includes("Error") ||
          output.includes("error") ||
          output.includes("not divisible by 2") ||
          output.includes("Invalid")
        ) {
          if (!output.includes("frame=") && !output.includes("time=")) {
            console.error(`[MAIN] [${this.label}] FFmpeg error:`, output.trim());
            hasError = true;
          }
        }

        if (output.includes("frame=") || output.includes("time=")) {
          this.emit("progress", output);
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
      });

      startupTimeout = setTimeout(() => {
        if (hasError) {
          const errorMsg = this.errorOutput.substring(0, 500);
          reject(new Error(`[${this.label}] FFmpeg startup failed: ${errorMsg}`));
        } else if (this.isRunning && this.process && !this.process.killed) {
          console.log(`[MAIN] [${this.label}] FFmpeg started successfully`);
          resolve();
        } else {
          reject(new Error(`[${this.label}] FFmpeg did not start correctly`));
        }
      }, 1500);

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
    const { gracePeriod = 10000, preStopDelay = 500 } = options;

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
