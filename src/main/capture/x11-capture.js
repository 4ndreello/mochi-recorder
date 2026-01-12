const { execSync } = require("child_process");
const BaseCapture = require("./base-capture");

/**
 * Error thrown when capture region is outside screen bounds
 */
class RegionOutOfBoundsError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RegionOutOfBoundsError";
    this.details = details;
  }
}

class X11Capture extends BaseCapture {
  constructor() {
    super();
    this.display = process.env.DISPLAY || ":0";
  }

  /**
   * Validates and clamps region to fit within screen bounds.
   * Returns adjusted region or throws if region is completely outside.
   * 
   * @param {Object} region - { x, y, width, height }
   * @param {Object} screenBounds - { width, height }
   * @returns {Object} - Clamped region { x, y, width, height, wasClamped }
   * @throws {RegionOutOfBoundsError} if region is completely outside screen
   */
  static validateAndClampRegion(region, screenBounds) {
    if (!region || !screenBounds) {
      throw new RegionOutOfBoundsError("Region or screen bounds not provided", {
        region,
        screenBounds,
      });
    }

    const { x, y, width, height } = region;
    const { width: screenWidth, height: screenHeight } = screenBounds;

    // Check if region is completely outside screen
    if (x >= screenWidth || y >= screenHeight) {
      throw new RegionOutOfBoundsError(
        `Region starts outside screen bounds. Region (${x}, ${y}) is outside screen (${screenWidth}x${screenHeight})`,
        { region, screenBounds }
      );
    }

    if (x + width <= 0 || y + height <= 0) {
      throw new RegionOutOfBoundsError(
        `Region is completely outside screen (negative area)`,
        { region, screenBounds }
      );
    }

    let clampedX = Math.max(0, x);
    let clampedY = Math.max(0, y);
    let clampedWidth = width;
    let clampedHeight = height;
    let wasClamped = false;

    // Adjust for negative x/y
    if (x < 0) {
      clampedWidth = width + x; // reduce width by overflow
      clampedX = 0;
      wasClamped = true;
    }
    if (y < 0) {
      clampedHeight = height + y;
      clampedY = 0;
      wasClamped = true;
    }

    // Clamp width/height to not exceed screen bounds
    if (clampedX + clampedWidth > screenWidth) {
      clampedWidth = screenWidth - clampedX;
      wasClamped = true;
    }
    if (clampedY + clampedHeight > screenHeight) {
      clampedHeight = screenHeight - clampedY;
      wasClamped = true;
    }

    // Ensure even dimensions for video encoding
    clampedWidth = clampedWidth % 2 === 0 ? clampedWidth : clampedWidth - 1;
    clampedHeight = clampedHeight % 2 === 0 ? clampedHeight : clampedHeight - 1;

    // Final sanity check
    if (clampedWidth <= 0 || clampedHeight <= 0) {
      throw new RegionOutOfBoundsError(
        `Region has no valid area after clamping. Width: ${clampedWidth}, Height: ${clampedHeight}`,
        { region, screenBounds, clamped: { x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight } }
      );
    }

    return {
      x: clampedX,
      y: clampedY,
      width: clampedWidth,
      height: clampedHeight,
      wasClamped,
    };
  }

  async getScreenResolution() {
    try {
      const output = execSync(`xrandr | grep '*' | head -1`, {
        encoding: "utf-8",
      });
      const match = output.match(/(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) };
      }
    } catch (error) {
      console.warn("Error detecting resolution, using default:", error);
    }
    return { width: 1920, height: 1080 };
  }

  async getX11ScreenBounds() {
    // Get real bounds of X11 virtual screen
    // x11grab uses absolute coordinates of virtual screen, not Electron
    try {
      const output = execSync(`xrandr --current`, {
        encoding: "utf-8",
      });

      // Find minimum x,y of all connected displays
      // This gives us the real X11 offset
      let minX = Infinity,
        minY = Infinity;
      const lines = output.split("\n");
      for (const line of lines) {
        // Look for pattern: 1920x1080+1366+0 or similar
        const match = line.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
        if (match) {
          const x = parseInt(match[3]);
          const y = parseInt(match[4]);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
        }
      }

      if (minX !== Infinity && minY !== Infinity) {
        return { minX, minY };
      }
    } catch (error) {
      console.warn("Error detecting X11 bounds:", error);
    }
    return { minX: 0, minY: 0 };
  }

  async getElectronScreenBounds() {
    // Get Electron bounds for comparison
    // Electron may be normalizing differently
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    let minX = Infinity,
      minY = Infinity;

    console.log("[X11Capture] Displays do Electron:");
    displays.forEach((display, i) => {
      const bounds = display.bounds;
      console.log(
        `  Display ${i}: bounds=${JSON.stringify(bounds)}, isPrimary=${
          display.id === screen.getPrimaryDisplay().id
        }`
      );
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
    });

    return {
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
    };
  }

  async findDisplayForCoordinates(x, y) {
    // Find which display contains the coordinates
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();

    for (const display of displays) {
      const bounds = display.bounds;
      if (
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height
      ) {
        return display;
      }
    }
    return screen.getPrimaryDisplay();
  }

  async buildVideoArgs() {
    const resolution = await this.getScreenResolution();

    let size, offset;
    if (this.region && this.region.width > 0 && this.region.height > 0) {
      const x11Bounds = await this.getX11ScreenBounds();
      const electronBounds = await this.getElectronScreenBounds();

      const targetDisplay = await this.findDisplayForCoordinates(
        this.region.x,
        this.region.y
      );
      console.log(
        `[MAIN] [X11Capture] Display alvo:`,
        JSON.stringify(targetDisplay.bounds)
      );

      const screenBounds = {
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height,
      };

      const relativeRegion = {
        x: this.region.x - targetDisplay.bounds.x,
        y: this.region.y - targetDisplay.bounds.y,
        width: this.region.width,
        height: this.region.height,
      };

      const clamped = X11Capture.validateAndClampRegion(relativeRegion, screenBounds);

      if (clamped.wasClamped) {
        console.log(
          `[MAIN] [X11Capture] Region was clamped to fit screen bounds:`,
          JSON.stringify(clamped)
        );
      }

      const finalX = targetDisplay.bounds.x + clamped.x;
      const finalY = targetDisplay.bounds.y + clamped.y;

      this.region.x = finalX;
      this.region.y = finalY;
      this.region.width = clamped.width;
      this.region.height = clamped.height;

      size = `${clamped.width}x${clamped.height}`;
      offset = `${finalX},${finalY}`;

      console.log(`[MAIN] [X11Capture] Recording: ${size} at ${offset}`);
      console.log(
        `[MAIN] [X11Capture] Electron region:`,
        JSON.stringify(this.region)
      );
      console.log(`[MAIN] [X11Capture] X11 bounds:`, JSON.stringify(x11Bounds));
      console.log(
        `[MAIN] [X11Capture] Electron bounds:`,
        JSON.stringify(electronBounds)
      );
      console.log(
        `[MAIN] [X11Capture] Final coordinates: x=${finalX}, y=${finalY}`
      );
    } else {
      size = `${resolution.width}x${resolution.height}`;
      offset = "0,0";
    }

    return [
      "-thread_queue_size",
      "1024",
      "-f",
      "x11grab",
      "-draw_mouse",
      this.drawMouse ? "1" : "0",
      "-s",
      size,
      "-r",
      String(this.fps),
      "-i",
      `${this.display}+${offset}`,
    ];
  }
}

module.exports = X11Capture;
module.exports.RegionOutOfBoundsError = RegionOutOfBoundsError;
