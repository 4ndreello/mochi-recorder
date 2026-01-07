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
   * Método abstrato para obter a fonte de vídeo específica do ambiente
   * Deve ser implementado pelas classes filhas
   */
  async getVideoSource() {
    throw new Error("getVideoSource() deve ser implementado pela classe filha");
  }

  /**
   * Método abstrato para construir os argumentos de vídeo do FFmpeg
   * Deve ser implementado pelas classes filhas
   */
  async buildVideoArgs() {
    throw new Error("buildVideoArgs() deve ser implementado pela classe filha");
  }

  /**
   * Constrói os argumentos de áudio comuns para ambas as implementações
   */
  buildAudioArgs() {
    const audioMonitor = getSystemAudioMonitor();
    const microphone = this.useMicrophone ? getSystemMicrophone() : null;

    const audioArgs = [];
    const audioInputs = [];

    // Áudio do sistema (monitor)
    audioInputs.push({ format: "pulse", source: audioMonitor });

    // Microfone (se habilitado)
    if (microphone) {
      audioInputs.push({ format: "pulse", source: microphone });
    }

    // Construir argumentos de entrada de áudio
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
   * Constrói os argumentos de filtro de áudio
   */
  buildAudioFilter(audioInputCount) {
    if (audioInputCount === 2) {
      // Misturar áudio do sistema e microfone
      // duration=longest garante que o áudio não seja cortado
      return "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[aout]";
    }
    return null;
  }

  /**
   * Constrói os argumentos de codificação comuns
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
      // Não usar -shortest aqui, pois pode cortar o áudio
      // O stopRecording() com SIGINT garante finalização correta
    ];
  }

  /**
   * Inicia a gravação - método comum que coordena a construção dos argumentos
   */
  async startRecording(outputPath) {
    const { audioArgs, audioInputs } = this.buildAudioArgs();
    const videoArgs = await this.buildVideoArgs();

    // Calcular índices de entrada
    // Áudio: 0, 1 (se houver microfone)
    // Vídeo: último índice (2 se houver microfone, 1 se não)
    const videoInputIndex = audioInputs.length;
    const hasMicrophone = audioInputs.length === 2;

    let args = [...audioArgs, ...videoArgs];

    // Construir filtros
    let filterComplex = null;
    const videoFilters = [];

    // Filtro de vídeo (crop se houver região)
    if (this.region && this.region.width > 0 && this.region.height > 0) {
      videoFilters.push(
        `[${videoInputIndex}:v]crop=${this.region.width}:${this.region.height}:${this.region.x}:${this.region.y}[vout]`
      );
    }

    // Filtro de áudio (mix se houver microfone)
    if (hasMicrophone) {
      const audioFilter = this.buildAudioFilter(2);
      if (audioFilter) {
        if (videoFilters.length > 0) {
          // Se houver crop de vídeo, combinar filtros
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
      // Sem microfone, apenas mapear vídeo e áudio do sistema
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

    // Adicionar argumentos de codificação
    args.push(...this.buildEncodingArgs());

    // Adicionar arquivo de saída
    args.push("-y", outputPath);

    this.ffmpegProcess = require("child_process").spawn("ffmpeg", args);

    // Configurar handlers de erro
    this.setupFFmpegErrorHandling();

    // Aguardar inicialização
    return this.waitForFFmpegStart();
  }

  /**
   * Configura o tratamento de erros do FFmpeg
   */
  setupFFmpegErrorHandling() {
    this.ffmpegProcess.on("error", (error) => {
      console.error("[MAIN] Erro ao iniciar FFmpeg:", error);
      throw error;
    });
  }

  /**
   * Aguarda o FFmpeg iniciar corretamente
   */
  waitForFFmpegStart() {
    return new Promise((resolve, reject) => {
      let hasError = false;
      let errorOutput = "";

      this.ffmpegProcess.stderr.on("data", (data) => {
        const output = data.toString();
        errorOutput += output;

        // Log de erros
        if (output.includes("error") || output.includes("Error")) {
          console.error("[MAIN] FFmpeg error:", output);
        }

        // Detectar erros críticos
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
              `FFmpeg falhou ao iniciar: ${errorOutput.substring(0, 200)}`
            )
          );
        } else if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          resolve();
        } else {
          reject(new Error("FFmpeg não iniciou corretamente"));
        }
      }, 1500);
    });
  }

  /**
   * Para a gravação de forma graciosa, garantindo que o áudio não seja cortado
   */
  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.ffmpegProcess) {
        resolve();
        return;
      }

      // Usar SIGINT em vez de escrever 'q' no stdin - mais confiável
      // SIGINT permite que o FFmpeg finalize o arquivo corretamente
      this.ffmpegProcess.kill("SIGINT");

      let resolved = false;

      const onClose = (code) => {
        if (!resolved) {
          resolved = true;
          console.log(`[MAIN] FFmpeg finalizado com código ${code}`);
          this.ffmpegProcess = null;
          resolve();
        }
      };

      this.ffmpegProcess.on("close", onClose);

      // Timeout de segurança - dar mais tempo para o FFmpeg finalizar
      // Isso é importante para garantir que o áudio seja completamente escrito
      setTimeout(() => {
        if (this.ffmpegProcess && !resolved) {
          console.warn(
            "[MAIN] FFmpeg não finalizou a tempo, forçando encerramento"
          );
          this.ffmpegProcess.kill("SIGTERM");

          // Aguardar um pouco mais antes de matar completamente
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
      }, 10000); // 10 segundos para finalizar - suficiente para garantir que o áudio seja escrito
    });
  }
}

module.exports = BaseCapture;
