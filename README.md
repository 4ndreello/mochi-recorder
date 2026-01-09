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
   </tr>
   <tr>
      <td>Node.js</td>
      <td>18+</td>
   </tr>
   <tr>
      <td>FFmpeg</td>
      <td>Latest</td>
   </tr>
   <tr>
      <td>Linux</td>
      <td>X11 or Wayland</td>
   </tr>
</table>
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
<h2>License</h2>
<p>MIT</p>