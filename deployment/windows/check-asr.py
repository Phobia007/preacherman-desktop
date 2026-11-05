import sys
from faster_whisper import WhisperModel

WhisperModel(sys.argv[1], device="cpu", compute_type="int8", local_files_only=True, cpu_threads=2)
print("Offline ASR model ready")
