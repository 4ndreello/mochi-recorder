const {
  getSystemAudioMonitor,
  getSystemMicrophone,
} = require("../utils/env-detector");
const FFmpegManager = require("../utils/ffmpeg-manager");

const QUALITY_CRF_MAP = {
  low: 28,
  medium: 23,
  high: 18,
};

class BaseCapture {
  constructor() {
    this.ffmpegManager = new FFmpegManager("Recording");
    this.region = null;
    this.useMicrophone = false;
    this.useSystemAudio = true;
    this.fps = 30;
    this.quality = "medium";
    this.drawMouse = false;
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

  setUseSystemAudio(useSystemAudio) {
    this.useSystemAudio = useSystemAudio;
  }

  setFps(fps) {
    this.fps = fps;
  }

  setQuality(quality) {
    this.quality = quality;
  }

  setDrawMouse(drawMouse) {
    this.drawMouse = drawMouse;
  }

  getCrf() {
    return QUALITY_CRF_MAP[this.quality] || 23;
  }

  async getVideoSource() {
    throw new Error("getVideoSource() must be implemented by child class");
  }

  async buildVideoArgs() {
    throw new Error("buildVideoArgs() must be implemented by child class");
  }

  buildAudioArgs() {
    const audioMonitor = this.useSystemAudio ? getSystemAudioMonitor() : null;
    const microphone = this.useMicrophone ? getSystemMicrophone() : null;

    const audioArgs = [];
    const audioInputs = [];

    if (audioMonitor) {
      audioInputs.push({ format: "pulse", source: audioMonitor });
    }

    if (microphone) {
      audioInputs.push({ format: "pulse", source: microphone });
    }

    audioInputs.forEach((input) => {
      // -thread_queue_size 4096 prevents audio buffer underruns
      // -use_wallclock_as_timestamps 1 syncs audio timestamps with system clock
      audioArgs.push(
        "-use_wallclock_as_timestamps", "1",
        "-thread_queue_size", "4096",
        "-f", input.format,
        "-i", input.source
      );
    });

    return {
      audioArgs,
      audioInputs,
      audioMonitor,
      microphone,
    };
  }

  buildAudioFilter(audioInputCount, videoInputIndex) {
    if (audioInputCount === 2) {
      // aresample=async=1 fixes audio/video timestamp drift
      return "[0:a]aresample=async=1[a0];[1:a]aresample=async=1[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]";
    } else if (audioInputCount === 1) {
      return "[0:a]aresample=async=1[aout]";
    }
    return null;
  }

  buildEncodingArgs() {
    const crf = this.getCrf();
    return [
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(crf),
      "-threads",
      "4",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
    ];
  }

  async startRecording(outputPath) {
    const { audioArgs, audioInputs } = this.buildAudioArgs();
    const videoArgs = await this.buildVideoArgs();

    const videoInputIndex = audioInputs.length;
    const audioCount = audioInputs.length;

    let args = [...audioArgs, ...videoArgs];

    let filterComplex = null;
    const videoFilters = [];

    if (this.region && this.region.width > 0 && this.region.height > 0) {
      videoFilters.push(
        `[${videoInputIndex}:v]crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}[vout]`
      );
    }

    if (audioCount === 2) {
      const audioFilter = this.buildAudioFilter(2);
      if (audioFilter) {
        if (videoFilters.length > 0) {
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
    } else if (audioCount === 1) {
      const audioFilter = this.buildAudioFilter(1, videoInputIndex);
      if (videoFilters.length > 0) {
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
    } else {
      if (videoFilters.length > 0) {
        filterComplex = videoFilters[0];
        args.push("-filter_complex", filterComplex, "-map", "[vout]");
      } else {
        args.push("-map", `${videoInputIndex}:v`);
      }
      args.push("-an");
    }

    if (audioCount > 0) {
      args.push(...this.buildEncodingArgs());
    } else {
      const crf = this.getCrf();
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        String(crf),
        "-threads",
        "4",
        "-pix_fmt",
        "yuv420p"
      );
    }

    args.push("-y", outputPath);

    return this.ffmpegManager.start(args);
  }

  async stopRecording() {
    return this.ffmpegManager.stop({
      gracePeriod: 10000,
      preStopDelay: 500,
    });
  }
}

module.exports = BaseCapture;
