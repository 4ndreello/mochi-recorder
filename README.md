<p align="center"><img src="src/renderer/assets/icon.png" alt="Mochi Icon" width="96" /></p>
<h1 align="center">Mochi – Linux Screen Recorder</h1>
<p align="center">A Screen Studio alternative for Linux with smooth cursor overlay and automatic zoom effects.</p>
<p align="center"><img src="https://img.shields.io/badge/platform-linux-blue" /><img src="https://img.shields.io/badge/node-%3E%3D18-green" /><img src="https://img.shields.io/badge/license-MIT-yellow" /></p>
<p align="center"><img src="https://github.com/user-attachments/assets/d53a07ec-282f-406c-b433-1fb9ad8a4bc2" alt="Mochi Screenshot" width="85%" /></p>
<h2>Features</h2>
<ul>
   <li>High quality screen recording</li>
   <li>Microphone and system audio recording</li>
   <li>X11 and Wayland support</li>
   <li>Smooth cursor overlay (alpha) - renders a polished macOS-style cursor on top of your recordings</li>
   <li>Persistent settings - your preferences are saved automatically and restored on next launch</li>
   <li>Configurable FPS and quality presets</li>
   <li>Area selection for partial screen recording</li>
</ul>
<h2>Recent Updates</h2>
<ul>
   <li><strong>Audio Backend Fallback:</strong> PulseAudio support with automatic ALSA fallback for broader Linux compatibility</li>
   <li><strong>Bounds Validation & Error Handling:</strong> Improved error handling for edge cases and invalid recording regions</li>
   <li><strong>Resizable Recording Area:</strong> Dynamically adjust your recording region during selection</li>
   <li><strong>FFmpeg Auto-Download:</strong> Automatic binary download on first launch (~40MB) with resumable downloads</li>
   <li><strong>Cursor Overlay Customization:</strong> Toggle smooth cursor overlay on/off and choose different cursor styles</li>
   <li><strong>Settings Persistence:</strong> User preferences automatically saved and restored on launch</li>
</ul>

<h2>Planned Features</h2>
<ul>
   <li>Automatic zoom on mouse clicks</li>
   <li>Smooth mouse movement interpolation</li>
</ul>
<h2>Quick Start</h2>
<p>Get up and running in 3 steps:</p>
<ol>
   <li><strong>Download & Install</strong> (choose one):
      <ul>
         <li><strong>.deb (Ubuntu/Debian):</strong> <code>sudo dpkg -i mochi_1.0.20_amd64.deb</code></li>
         <li><strong>AppImage:</strong> <code>chmod +x Mochi.AppImage && ./Mochi.AppImage</code></li>
      </ul>
   </li>
   <li><strong>Start Recording</strong> → Click "Start Recording" in the tray menu</li>
   <li><strong>Select Area</strong> → Drag to select your recording region</li>
   <li><strong>Configure</strong> → Choose FPS, quality, audio sources, cursor overlay</li>
   <li><strong>Record</strong> → Click start, perform your actions, click stop when done</li>
</ol>

<h2>Releases</h2>
<p>Pre-built packages are available on the <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a> page:</p>
<ul>
   <li>AppImage</li>
   <li>.deb (Debian/Ubuntu)</li>
</ul>
<h2>System Requirements</h2>
<table>
   <tr>
      <th>Requirement</th>
      <th>Version</th>
      <th>Notes</th>
   </tr>
   <tr>
      <td>Linux</td>
      <td>Any modern distribution</td>
      <td>Ubuntu 20.04+, Fedora, Arch, Debian, etc.</td>
   </tr>
   <tr>
      <td>Display Server</td>
      <td>X11 or Wayland</td>
      <td>Automatically detected and supported</td>
   </tr>
   <tr>
      <td>Audio System</td>
      <td>PulseAudio or ALSA</td>
      <td>Auto-detected with fallback support</td>
   </tr>
</table>

<h3>System Dependencies</h3>
<p><strong>Ubuntu/Debian:</strong></p>
<pre><code>sudo apt install xdotool xinput x11-xserver-utils pulseaudio-utils</code></pre>

<p><strong>Fedora:</strong></p>
<pre><code>sudo dnf install xdotool xinput x11-utils pulseaudio-utils</code></pre>

<p><strong>Arch:</strong></p>
<pre><code>sudo pacman -S xdotool xinput xorg-xsetroot pulseaudio-utils</code></pre>

<h3>Development Requirements</h3>
<table>
   <tr>
      <th>Tool</th>
      <th>Version</th>
      <th>Purpose</th>
   </tr>
   <tr>
      <td>Node.js</td>
      <td>18+</td>
      <td>Building from source and development</td>
   </tr>
   <tr>
      <td>npm</td>
      <td>9+</td>
      <td>Package management</td>
   </tr>
</table>

<p><strong>Important:</strong> FFmpeg is automatically downloaded on first launch (~40MB). No manual installation needed! The application will detect and use system FFmpeg if available.</p>
<h2>First Launch</h2>
<p>When you launch Mochi for the first time, it will:</p>
<ol>
   <li>Check for FFmpeg installation</li>
   <li>If FFmpeg is not found, show a progress dialog for automatic download (~40MB)</li>
   <li>Download, extract, and verify FFmpeg binaries (2-3 minutes depending on connection)</li>
   <li>Store FFmpeg in <code>~/.config/mochi/bin/</code> for future launches</li>
   <li>Start normally after download completes</li>
</ol>
<p><strong>Note:</strong> This is a one-time download. Subsequent launches will start immediately without any download.</p>
<p>If you already have FFmpeg installed system-wide, Mochi will detect and use it automatically.</p>

<h2>Installation</h2>

<h3>Option 1: Using .deb Package (Recommended for Ubuntu/Debian)</h3>
<ol>
   <li>Download the latest <code>.deb</code> file from the <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a> page</li>
   <li>Install using dpkg:
      <pre><code>sudo dpkg -i mochi_1.0.20_amd64.deb</code></pre>
   </li>
   <li>Launch Mochi from your application menu or run:
      <pre><code>mochi</code></pre>
   </li>
</ol>

<h3>Option 2: Using AppImage (Universal Linux)</h3>
<ol>
   <li>Download the latest <code>Mochi.AppImage</code> from the <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a> page</li>
   <li>Make it executable:
      <pre><code>chmod +x Mochi.AppImage</code></pre>
   </li>
   <li>Run:
      <pre><code>./Mochi.AppImage</code></pre>
   </li>
</ol>

<h3>Option 3: Build from Source</h3>
<ol>
   <li>Clone the repository:
      <pre><code>git clone https://github.com/4ndreello/mochi-recorder.git
cd mochi-recorder</code></pre>
   </li>
   <li>Install dependencies:
      <pre><code>npm install</code></pre>
   </li>
   <li>Build for your system:
      <pre><code>npm run build:linux</code></pre>
   </li>
   <li>Find the built packages in the <code>dist/</code> directory</li>
</ol>
<h2>Development</h2>
<p>After cloning the repository and running <code>npm install</code>:</p>
<pre><code>npm run dev</code></pre>

<p>For testing:</p>
<pre><code>npm test              # Run unit tests
npm test:watch       # Run tests in watch mode
npm test:coverage    # Generate coverage report
npm test:e2e         # Run end-to-end tests</code></pre>

<p><strong>Build:</strong></p>
<pre><code>npm run build:linux  # Build AppImage and .deb packages</code></pre>
<h2>Updating Mochi</h2>

<h3>Automatic Updates</h3>
<p>Mochi checks for updates automatically and notifies you when a new version is available. Click the notification to update.</p>

<h3>Manual Update - .deb Package</h3>
<ol>
   <li>Download the latest <code>.deb</code> from <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a></li>
   <li>Install the new version:
      <pre><code>sudo dpkg -i mochi_1.0.21_amd64.deb</code></pre>
   </li>
   <li>Restart Mochi</li>
</ol>

<h3>Manual Update - AppImage</h3>
<ol>
   <li>Download the latest <code>Mochi.AppImage</code> from <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a></li>
   <li>Replace your current AppImage:
      <pre><code>chmod +x Mochi.AppImage
./Mochi.AppImage</code></pre>
   </li>
</ol>

<h2>Usage</h2>
<ol>
   <li>Launch the application (it runs in the system tray)</li>
   <li>Click <strong>Start Recording</strong> from the tray menu</li>
   <li>Select the area you want to record</li>
   <li>Configure your settings (FPS, quality, cursor overlay, audio sources)</li>
   <li>Click the record button to start</li>
   <li>Click <strong>Stop Recording</strong> when done</li>
   <li>The video will be processed automatically with the cursor overlay applied</li>
</ol>
<h2>Configuration</h2>
<p>Settings are stored in <code>~/.config/mochi/settings.json</code> and include:</p>
<ul>
   <li><strong>FPS</strong>: 30 or 60 frames per second</li>
   <li><strong>Quality</strong>: Low, Medium, or High</li>
   <li><strong>Cursor Overlay</strong>: Enable/disable the smooth cursor effect</li>
   <li><strong>Microphone</strong>: Record audio from your microphone</li>
   <li><strong>System Audio</strong>: Capture desktop audio</li>
</ul>
<h2>Troubleshooting</h2>
<h3>FFmpeg Download Issues</h3>
<p><strong>Problem:</strong> Download fails or times out</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Check your internet connection</li>
   <li>Try again - Mochi will resume the download</li>
   <li>Alternatively, install FFmpeg manually:
      <pre><code>sudo apt install ffmpeg  # Ubuntu/Debian
sudo dnf install ffmpeg  # Fedora</code></pre>
   </li>
   <li>Restart Mochi - it will detect and use your system FFmpeg</li>
</ol>

<p><strong>Problem:</strong> "FFmpeg not found" error appears</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Delete the downloaded FFmpeg: <code>rm -rf ~/.config/mochi/bin/</code></li>
   <li>Restart Mochi to re-download</li>
   <li>Or install system FFmpeg: <code>sudo apt install ffmpeg</code></li>
</ol>

<p><strong>Problem:</strong> Want to use system FFmpeg instead of downloaded version</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Install FFmpeg: <code>sudo apt install ffmpeg</code></li>
   <li>Restart Mochi - it will automatically use system FFmpeg</li>
   <li>Optionally delete Mochi's downloaded copy: <code>rm -rf ~/.config/mochi/bin/ffmpeg</code></li>
</ol>

<h3>Audio Issues</h3>
<p><strong>Problem:</strong> No microphone or system audio being captured</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Check your audio settings in Mochi's preferences (microphone/system audio toggles)</li>
   <li>Verify PulseAudio/ALSA is running:
      <pre><code>pgrep pulseaudio  # Should return a process ID</code></pre>
   </li>
   <li>List available devices:
      <pre><code>pacmd list-sources 2>/dev/null | grep "name:"  # PulseAudio
arecord -l  # ALSA</code></pre>
   </li>
   <li>If using Wayland, ensure your audio backend supports Wayland</li>
</ol>

<h3>Recording Area Not Selecting Properly</h3>
<p><strong>Problem:</strong> Drag-to-select doesn't work or region is incorrect</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Try resizing the selection area manually (dragging corners)</li>
   <li>For multi-monitor setups, verify all displays are properly detected:
      <pre><code>xrandr  # X11
wlrandr  # Wayland</code></pre>
   </li>
   <li>Check if your window manager is compatible with Mochi's UI</li>
</ol>

<h3>Cursor Overlay Not Visible in Recording</h3>
<p><strong>Problem:</strong> Cursor overlay enabled but not showing in final video</p>
<p><strong>Solution:</strong></p>
<ol>
   <li>Ensure cursor overlay is enabled in settings</li>
   <li>Check that the video was processed (look for cursor overlay checkbox after recording stops)</li>
   <li>Verify Canvas support is working (may require graphics driver updates)</li>
   <li>Try disabling and re-enabling cursor overlay in preferences</li>
</ol>

<h3>Debug Mode</h3>
<p>To force Mochi to use system FFmpeg (bypass downloading):</p>
<pre><code>./Mochi.AppImage --force-system-binary</code></pre>

<p>For development debugging:</p>
<pre><code>npm run dev  # Runs with dev console</code></pre>

<h2>Uninstalling</h2>

<h3>Uninstall .deb Package</h3>
<pre><code>sudo dpkg -r mochi
# Or with apt:
sudo apt remove mochi</code></pre>

<p><strong>Clean up user data (optional):</strong></p>
<pre><code>rm -rf ~/.config/mochi/</code></pre>

<h3>Uninstall AppImage</h3>
<p>Simply delete the <code>Mochi.AppImage</code> file. Your settings are stored in <code>~/.config/mochi/</code> and can be removed if desired.</p>

<h2>License</h2>
<p>MIT</p>
<p><strong>Note:</strong> Mochi uses FFmpeg which is licensed under GPLv3. FFmpeg source code is available at <a href="https://ffmpeg.org/">ffmpeg.org</a>. Mochi remains MIT licensed, but when distributed, you must ensure FFmpeg's GPLv3 license is included with it.</p>
