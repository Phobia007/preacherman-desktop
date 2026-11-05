# Preacherman adapter for the pinned dlp3d/audio2face image.
from cpu import *

max_workers = 2
enable_cors = False
python_api_cfg['profiles']['arkit'] = ['unitalker_clip']
python_api_cfg['profiles']['preacherman-arkit'] = ['unitalker_clip']
