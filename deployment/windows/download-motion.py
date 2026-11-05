"""Download the pinned upstream motion archive with a bounded transfer timeout."""
import sys
import subprocess

try:
    subprocess.run([sys.executable, "-m", "gdown", "--fuzzy", "--no-cookies", sys.argv[1], "-O", sys.argv[2]], check=True, timeout=1800)
except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
    raise SystemExit("Motion download failed. Use the official mirror in runtime-assets.json and place motion_data.zip in the download cache.")
