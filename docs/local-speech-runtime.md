# Local speech recognition and streamed playback

The desktop service automatically uses the managed accelerated recognizer when both
`D:\AI\PreachermanSpeech\venv\Scripts\python.exe` and
`D:\AI\PreachermanSpeech\models\base\model.bin` exist. Otherwise it preserves the
previous installed Python / Whisper base capability. Runtime paths cannot be supplied
by a browser request. Models are never downloaded by the running desktop service.

The managed installation uses faster-whisper 1.2.1 and CTranslate2 CPU INT8, with four
CPU threads, one worker and beam size 5. The multilingual model is the official
`Systran/faster-whisper-base` conversion. Exact installed dependencies are recorded in
`D:\AI\PreachermanSpeech\requirements.lock.txt`; model revision and SHA-256 are in
`D:\AI\PreachermanSpeech\runtime-manifest.json`. Its venv, model, temporary files,
pip cache and Hugging Face cache are all on D:. It does not reserve CUDA memory used
by the character renderer or Breeze.

The recognizer is a hidden stdin/stdout Python child of `preacherman-service.exe`.
It listens on no port and stores neither microphone recordings nor transcripts.
Opening voice mode loads and warms it before accepting speech. Turns reuse the
loaded model. After 90 seconds idle, cancellation, or service shutdown, the owned
worker exits. The next voice session warms a new worker; there is no separate
background service to stop.

Breeze continues using its existing voices and local service at port 18760.
`POST /api/characters/:id/voice/stream` verifies the character's selected voice and
streams 24 kHz mono signed little-endian PCM. Preview and non-Breeze speech retain
their existing WAV endpoints. Playback starts after a short initial PCM buffer,
prefetches the next sentence only after generation reaches EOF, and immediately
cancels audio and generation on interruption. The media clock excludes underrun
gaps. Audio2Face receives the actual resampled audio; body gestures use an estimated
sentence duration until the real audio end triggers the existing release envelope.

Source checks cover streamed byte boundaries, playback before EOF, cancellation,
selected-voice ownership, truncated streams, face resampling and the existing
Cortana transitions. Native release verification also exercises both appearance
modes, sentence continuity, interruption, and normal navigation.
