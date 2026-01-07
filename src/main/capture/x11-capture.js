const { execSync } = require("child_process");
const BaseCapture = require("./base-capture");

class X11Capture extends BaseCapture {
  constructor() {
    super();
    this.display = process.env.DISPLAY || ":0";
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

  /**
   * Builds X11-specific video arguments
   */
  async buildVideoArgs() {
    const resolution = await this.getScreenResolution();

    // If region is selected, use it; otherwise, record entire screen
    let size, offset;
    if (this.region && this.region.width > 0 && this.region.height > 0) {
      size = `${this.region.width}x${this.region.height}`;

      // x11grab uses absolute X11 coordinates
      // Electron may normalize coordinates differently
      const x11Bounds = await this.getX11ScreenBounds();
      const electronBounds = await this.getElectronScreenBounds();

      // Find which display contains the selection
      const targetDisplay = await this.findDisplayForCoordinates(
        this.region.x,
        this.region.y
      );
      console.log(
        `[MAIN] [X11Capture] Display alvo:`,
        JSON.stringify(targetDisplay.bounds)
      );

      // Electron and X11 use absolute coordinates of virtual screen
      // Coordinates should already be correct
      let adjustedX = this.region.x;
      let adjustedY = this.region.y;

      // Check if selection is inside any display
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();
      let insideDisplay = false;
      for (const display of displays) {
        const b = display.bounds;
        if (
          adjustedX >= b.x &&
          adjustedX < b.x + b.width &&
          adjustedY >= b.y &&
          adjustedY < b.y + b.height
        ) {
          insideDisplay = true;
          console.log(
            `[MAIN] [X11Capture] Selection is inside display: ${JSON.stringify(
              b
            )}`
          );
          break;
        }
      }

      if (!insideDisplay) {
        console.log(
          `[MAIN] [X11Capture] WARNING: Selection is outside all displays!`
        );
        console.log(
          `[MAIN] [X11Capture] This may indicate a problem with coordinates.`
        );
      }

      offset = `${adjustedX},${adjustedY}`;
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
        `[MAIN] [X11Capture] Final coordinates: x=${adjustedX}, y=${adjustedY}`
      );
    } else {
      size = `${resolution.width}x${resolution.height}`;
      offset = "0,0";
    }

    return [
      "-f",
      "x11grab",
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
