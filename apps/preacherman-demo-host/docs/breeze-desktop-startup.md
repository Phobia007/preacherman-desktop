# Breeze desktop startup

The packaged Windows sidecar starts the installed Breeze service in the background
after the local Preacherman API is ready. Home and navigation do not wait for the
voice model to load. The first Voice collection request waits for this same startup
so it does not show an empty library while the model is loading.

- Installation and model: `D:\AI\Breeze-TTS-2` (no model is installed on C:).
- Launcher: `Start-Breeze.ps1 -NoBrowser`, with a hidden PowerShell window.
- HTTP and voice library: `127.0.0.1:18760`; Breeze WebSocket: `127.0.0.1:18761`.
- Healthy existing services are reused. Simultaneous automatic startup, voice
  collection reads and manual reconnect share one launch attempt.
- The installed launcher checks process ownership and occupied ports before
  spawning `runtime\breeze-tts-2-v0.1.3-windows-x64-vulkan\breeze-server.exe`.
- Startup is bounded to 190 seconds. Failure does not close the desktop or change
  character voice selections. Reconnect is available in Asset > Settings > Voice
  Service. Cancelling a page request does not cancel the shared model startup.
- Breeze retains its independent lifetime so its management shortcut and desktop
  can share the loaded model. The runtime PID, start time and executable are in
  `D:\AI\Breeze-TTS-2\server-process.json`; logs are in that installation's `logs`.
  Stop it using `D:\AI\Breeze-TTS-2\Stop-Breeze.ps1`, which checks ownership.
- Browser development/test servers do not auto-start the installed model.

No credentials, voice clones, execution profiles or voice assignments are changed
by startup. Audio synthesis still uses the character's existing selected voice.
