const {
  getSystemAudioMonitor,
  getSystemMicrophone,
} = require("../utils/env-detector");

class BaseCapture {
  constructor() {
    this.ffmpegProcess = null;
    this.region = null;
    this.useMicrophone = false;
  }

  setRegion(region) {
    if (region) {
      this.region = {
        x: region.x,
        y: region.y,
        width: region.width % 2 === 0 ? region.width : region.width - 1,
        height: region.height % 2 === 0 ? region.height : region.height - 1,
      };
    } else {
      this.region = null;
    }
  }

  setUseMicrophone(useMic) {
    this.useMicrophone = useMic;
  }

  /**
   * Abstract method to get the video source specific to the environment
   * Must be implemented by child classes
   */
  async getVideoSource() {
    throw new Error("getVideoSource() must be implemented by child class");
  }

  /**
   * Abstract method to build FFmpeg video arguments
   * Must be implemented by child classes
   */
  async buildVideoArgs() {
    throw new Error("buildVideoArgs() must be implemented by child class");
  }

  /**
   * Builds common audio arguments for both implementations
   */
  buildAudioArgs() {
    const audioMonitor = getSystemAudioMonitor();
    const microphone = this.useMicrophone ? getSystemMicrophone() : null;

    const audioArgs = [];
    const audioInputs = [];

    // System audio (monitor)
    audioInputs.push({ format: "pulse", source: audioMonitor });

    // Microphone (if enabled)
    if (microphone) {
      audioInputs.push({ format: "pulse", source: microphone });
    }

    // Build audio input arguments
    audioInputs.forEach((input) => {
      audioArgs.push("-f", input.format, "-i", input.source);
    });

    return {
      audioArgs,
      audioInputs,
      audioMonitor,
      microphone,
    };
  }

  /**
   * Builds audio filter arguments
   */
  buildAudioFilter(audioInputCount) {
    if (audioInputCount === 2) {
      // Mix system audio and microphone
      // duration=longest ensures audio is not cut
      return "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[aout]";
    }
    return null;
  }

  /**
   * Builds common encoding arguments
   */
  buildEncodingArgs() {
    return [
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      // Don't use -shortest here, as it may cut audio
      // stopRecording() with SIGINT ensures correct finalization
    ];
  }

  /**
   * Starts recording - common method that coordinates argument building
   */
  async startRecording(outputPath) {
    const { audioArgs, audioInputs } = this.buildAudioArgs();
    const videoArgs = await this.buildVideoArgs();

    // Calculate input indices
    // Audio: 0, 1 (if microphone exists)
    // Video: last index (2 if microphone exists, 1 if not)
    const videoInputIndex = audioInputs.length;
    const hasMicrophone = audioInputs.length === 2;

    let args = [...audioArgs, ...videoArgs];

    // Construir filtros
    let filterComplex = null;
    const videoFilters = [];

    // Video filter (crop if region exists)
    if (this.region && this.region.width > 0 && this.region.height > 0) {
      videoFilters.push(
        `[${videoInputIndex}:v]crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}[vout]`
      );
    }

    // Audio filter (mix if microphone exists)
    if (hasMicrophone) {
      const audioFilter = this.buildAudioFilter(2);
      if (audioFilter) {
        if (videoFilters.length > 0) {
          // If video crop exists, combine filters
          filterComplex = `${videoFilters[0]};${audioFilter}`;
          args.push(
            "-filter_complex",
            filterComplex,
            "-map",
            "[vout]",
            "-map",
            "[aout]"
          );
        } else {
          filterComplex = audioFilter;
          args.push(
            "-filter_complex",
            filterComplex,
            "-map",
            `${videoInputIndex}:v`,
            "-map",
            "[aout]"
          );
        }
      }
    } else {
      // Without microphone, just map video and system audio
      if (videoFilters.length > 0) {
        filterComplex = videoFilters[0];
        args.push(
          "-filter_complex",
          filterComplex,
          "-map",
          "[vout]",
          "-map",
          "0:a"
        );
      } else {
        args.push("-map", `${videoInputIndex}:v`, "-map", "0:a");
      }
    }

    // Add encoding arguments
    args.push(...this.buildEncodingArgs());

    // Add output file
    args.push("-y", outputPath);

    this.ffmpegProcess = require("child_process").spawn("ffmpeg", args);

    // Configure error handlers
    this.setupFFmpegErrorHandling();

    // Wait for initialization
    return this.waitForFFmpegStart();
  }

  /**
   * Configures FFmpeg error handling
   */
  setupFFmpegErrorHandling() {
    this.ffmpegProcess.on("error", (error) => {
      console.error("[MAIN] Error starting FFmpeg:", error);
      throw error;
    });
  }

  /**
   * Waits for FFmpeg to start correctly
   */
  waitForFFmpegStart() {
    return new Promise((resolve, reject) => {
      let hasError = false;
      let errorOutput = "";

      this.ffmpegProcess.stderr.on("data", (data) => {
        const output = data.toString();
        errorOutput += output;

        // Log errors
        if (output.includes("error") || output.includes("Error")) {
          console.error("[MAIN] FFmpeg error:", output);
        }

        // Detect critical errors
        if (
          output.includes("error") ||
          output.includes("Error") ||
          output.includes("not divisible by 2")
        ) {
          hasError = true;
        }
      });

      setTimeout(() => {
        if (hasError) {
          reject(
            new Error(
              `FFmpeg failed to start: ${errorOutput.substring(0, 200)}`
            )
          );
        } else if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          resolve();
        } else {
          reject(new Error("FFmpeg did not start correctly"));
        }
      }, 1500);
    });
  }

  /**
   * Stops recording gracefully, ensuring audio is not cut
   */
  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.ffmpegProcess) {
        resolve();
        return;
      }

      // Use SIGINT instead of writing 'q' to stdin - more reliable
      // SIGINT allows FFmpeg to finalize the file correctly
      this.ffmpegProcess.kill("SIGINT");

      let resolved = false;

      const onClose = (code) => {
        if (!resolved) {
          resolved = true;
          console.log(`[MAIN] FFmpeg finished with code ${code}`);
          this.ffmpegProcess = null;
          resolve();
        }
      };

      this.ffmpegProcess.on("close", onClose);

      // Safety timeout - give more time for FFmpeg to finish
      // This is important to ensure audio is completely written
      setTimeout(() => {
        if (this.ffmpegProcess && !resolved) {
          console.warn(
            "[MAIN] FFmpeg did not finish in time, forcing termination"
          );
          this.ffmpegProcess.kill("SIGTERM");

          // Wait a bit more before killing completely
          setTimeout(() => {
            if (this.ffmpegProcess) {
              this.ffmpegProcess.kill("SIGKILL");
            }
            if (!resolved) {
              resolved = true;
              this.ffmpegProcess = null;
              resolve();
            }
          }, 2000);
        }
      }, 10000); // 10 seconds to finish - enough to ensure audio is written
    });
  }
}

module.exports = BaseCapture;
