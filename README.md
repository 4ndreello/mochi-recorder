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
<h2>Not Yet Implemented</h2>
<ul>
   <li>Automatic zoom on mouse clicks</li>
   <li>Smooth mouse movement interpolation</li>
</ul>
<h2>Releases</h2>
<p>Pre-built packages are available on the <a href="https://github.com/4ndreello/mochi-recorder/releases">Releases</a> page:</p>
<ul>
   <li>AppImage</li>
   <li>.deb</li>
</ul>
<h2>Requirements</h2>
<table>
   <tr>
      <th>Item</th>
      <th>Version</th>
      <th>Notes</th>
   </tr>
   <tr>
      <td>Node.js</td>
      <td>18+</td>
      <td>Required for development only</td>
   </tr>
   <tr>
      <td>Linux</td>
      <td>X11 or Wayland</td>
      <td>Ubuntu, Fedora, Arch, etc.</td>
   </tr>
   <tr>
      <td>X11/Wayland Tools</td>
      <td>Latest</td>
      <td><code>xdotool</code>, <code>xinput</code>, <code>x11-xserver-utils</code>, <code>pw-cli</code></td>
   </tr>
</table>

<p><strong>Note:</strong> FFmpeg is automatically downloaded on first launch (~40MB). No manual installation needed!</p>
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
<pre><code>npm install</code></pre>
<h2>Development</h2>
<pre><code>npm run dev</code></pre>
<h2>Build (Linux)</h2>
<pre><code>npm run build:linux</code></pre>
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

<h3>Debug Mode</h3>
<p>To force Mochi to use system FFmpeg (bypass downloading):</p>
<pre><code>./Mochi.AppImage --force-system-binary</code></pre>

<h2>License</h2>
<p>MIT</p>
<p><strong>Note:</strong> Mochi uses FFmpeg which is licensed under GPLv3. FFmpeg source code is available at <a href="https://ffmpeg.org/">ffmpeg.org</a>. Mochi remains MIT licensed, but when distributed, you must ensure FFmpeg's GPLv3 license is included with it.</p>
