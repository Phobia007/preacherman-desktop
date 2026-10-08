---
license: cc-by-4.0
task_categories:
- text-to-3d
- robotics
- text-to-speech
language:
- zh
tags:
- interactive
- motion
- avatar
size_categories:
- 10K<n<100K
---
# SuSuInterActs Dataset

<p align="center">
  <a href="https://arxiv.org/abs/2604.02908"><img src="https://img.shields.io/badge/arXiv-2604.02908-b31b1b.svg" alt="arXiv"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/Clips-21K-blue.svg" alt="Clips">
  <img src="https://img.shields.io/badge/Duration-37h-green.svg" alt="Duration">
</p>

<p align="center">
  <b>A Large-Scale Multimodal Dialogue Corpus with Synchronized Speech, Full-Body Motion, and Facial Expressions</b>
</p>

<p align="center">
  From the paper: <a href="https://arxiv.org/abs/2604.02908"><i>SentiAvatar: Towards Expressive and Interactive Digital Humans</i></a>
</p>

---

## Overview

**SuSuInterActs** is a high-quality dialogue motion capture dataset built around a single virtual character **SuSu (苏苏)**. The dataset features synchronized multi-modal data captured via professional optical motion capture, including:

- 🗣️ **Speech Audio** — Natural Chinese conversational speech
- 💃 **Full-Body Motion** — 63-joint skeleton with body, hands, and fingers (6D rotation)
- 🎭 **Facial Expressions** — 51-dimensional ARKit BlendShape coefficients
- 📝 **Rich Text Annotations** — Action tags, expression tags, and dialogue transcripts

<p align="center">
  <img src="modality_overview.png" width="85%" alt="Dataset Modality Overview">
</p>

### Key Statistics

| Stat | Value |
|------|-------|
| **Total clips** | 21,133 |
| **Total duration** | ~37 hours |
| **Avg. clip duration** | ~5.4 seconds |
| **Frame rate** | 20 FPS (motion & face), 16kHz (audio) |
| **Skeleton** | 63 joints (25 body + 20 left hand + 20 right hand) |
| **Face dims** | 51 (ARKit BlendShape) |
| **Language** | Chinese (Mandarin) |
| **Splits** | Train: 19,019 / Val: 635 / Test: 1,479 |


## 📁 Directory Structure

```
SuSuInterActs/
├── README.md
├── assets/                          # Figures for this README
│
├── motion_data/                     # 💃 Full-body motion data (4.9 GB)
│   ├── fbx_to_json_data_susu_retarget_maya/
│   │   ├── 20250801/
│   │   │   ├── Human_xxx.npy
│   │   │   └── ...
│   │   ├── 20250804/
│   │   └── ...  (40+ capture sessions)
│   └── fbx_to_json_data_susu_chonglu/
│       ├── 20260115/
│       └── ...
│
├── wav_data/                        # 🔊 Speech audio (6.3 GB)
│   ├── fbx_to_json_data_susu_retarget_maya/
│   │   └── ... (same structure as motion_data)
│   └── fbx_to_json_data_susu_chonglu/
│       └── ...
│
├── arkit_data/                      # 🎭 Facial expression data (750 MB)
│   └── fbx_to_json_data_susu_retarget_maya/
│       └── ... (same structure)
│
├── text_data/                       # 📝 Text annotations (8 MB)
│   ├── motion2text.json             # Main annotation file: name → text+tags
│   ├── train.json                   # Training set annotations
│   ├── val.json                     # Validation set annotations
│   └── test.json                    # Test set annotations
│
└── split/                           # 📋 Data splits
    ├── all_file_list.txt            # 21,133 entries
    ├── train_file_list.txt          # 19,019 entries
    ├── val_file_list.txt            #    635 entries
    └── test_file_list.txt           #  1,479 entries
```

**Total size: ~12 GB**

## 📊 Data Formats

### Motion Data (`motion_data/*.npy`)

Each `.npy` file stores a Python dictionary with 4 keys:

```python
import numpy as np

data = np.load("motion_data/fbx_to_json_data_susu_retarget_maya/20250801/Human_xxx.npy", 
               allow_pickle=True).item()

data["body"]       # (T, 153)  — root offset velocity (3) + body 6D rotation (25×6)
data["left"]       # (T, 120)  — left hand 6D rotation (20×6)
data["right"]      # (T, 120)  — right hand 6D rotation (20×6)
data["positions"]  # (T, 63, 3) — 3D joint positions (for visualization)
```

| Key | Shape | Description |
|-----|-------|-------------|
| `body` | `(T, 153)` | Root offset velocity (3D) + 25 body joints × 6D rotation |
| `left` | `(T, 120)` | 20 left hand joints × 6D rotation |
| `right` | `(T, 120)` | 20 right hand joints × 6D rotation |
| `positions` | `(T, 63, 3)` | Global 3D joint positions (63 joints × xyz) |

- **Frame rate**: 20 FPS
- **Rotation representation**: 6D rotation
- **Root displacement**: The first 3 dims of `body` encode root translation velocity (differential encoding). To recover absolute position, accumulate: `pos[t] = pos[t-1] + vel[t]`

### 63-Joint Skeleton

```
Body (25 joints):
  pelvis → thigh_r → calf_r → foot_r → ball_r
         → thigh_l → calf_l → foot_l → ball_l
         → spine_01 → spine_02 → spine_03 → spine_04 → spine_05
           → neck_01 → neck_02 → head
           → clavicle_l → upperarm_l → lowerarm_l → hand_l
           → clavicle_r → upperarm_r → lowerarm_r → hand_r

Left Hand (20 joints):
  hand_l → index[0-3] → middle[0-3] → ring[0-3] → pinky[0-3] → thumb[0-2]

Right Hand (20 joints):
  hand_r → index[0-3] → middle[0-3] → ring[0-3] → pinky[0-3] → thumb[0-2]
```

### Facial Data (`arkit_data/*.npy`)

```python
face = np.load("arkit_data/.../Human_xxx.npy")  # shape: (T, 51), dtype: float64
```

51-dimensional ARKit BlendShape coefficients (values in [0, 1]):

| Index | BlendShape | Index | BlendShape |
|-------|-----------|-------|-----------|
| 0 | browDownLeft | 26 | mouthClose |
| 1 | browDownRight | 27 | mouthDimpleLeft |
| 2 | browInnerUp | 28 | mouthDimpleRight |
| 3 | browOuterUpLeft | ... | ... |
| 8 | eyeBlinkLeft | 43 | mouthSmileLeft |
| 9 | eyeBlinkRight | 44 | mouthSmileRight |
| 24 | jawOpen | 50 | noseSneerRight |

### Audio Data (`wav_data/*.wav`)

- **Format**: WAV, 16-bit PCM
- **Sample Rate**: 16,000 Hz (mono)
- **Language**: Chinese (Mandarin)

### Text Annotations (`text_data/motion2text.json`)

Each entry maps a clip name to its annotation string:

```json
{
  "fbx_to_json_data_susu_retarget_maya/20250826/Human_0825_153-5_01": 
    "【表情：微笑询问】【动作：头微向右歪】还有睡前准备啥的...",
  
  "fbx_to_json_data_susu_chonglu/20260115/Human_100_73_01_B": 
    "【表情：眼神认真】【动作：身体微前倾】安安，你跟姐姐说实话。"
}
```

**Annotation format**: `【表情：<expression_tag>】【动作：<action_tag>】<dialogue_transcript>`

- **Expression tags** (表情): e.g., 微笑 (smile), 认真 (serious), 担忧 (worried), 调皮 (playful)
- **Action tags** (动作): e.g., 缓慢点头 (slow nod), 双臂展开 (arms spread), 头微向右歪 (head tilt right)



### Split Files (`split/*.txt`)

Each line is a relative path (without extension) identifying a clip:

```
fbx_to_json_data_susu_chonglu/20260115/Human_82_84_01_B
fbx_to_json_data_susu_retarget_maya/20250905/Human_0904_152-8_01
...
```

Use these to load the corresponding files:
```python
name = "fbx_to_json_data_susu_retarget_maya/20250905/Human_0904_152-8_01"
motion = np.load(f"motion_data/{name}.npy", allow_pickle=True).item()
face   = np.load(f"arkit_data/{name}.npy")
audio  = f"wav_data/{name}.wav"
text   = motion2text[name]
```

## 🔧 Quick Start

### Load a sample

```python
import numpy as np
import json
import soundfile as sf

# Load split
with open("split/test_file_list.txt") as f:
    test_names = [line.strip() for line in f if line.strip()]

name = test_names[0]

# Load motion
motion = np.load(f"motion_data/{name}.npy", allow_pickle=True).item()
print(f"Body: {motion['body'].shape}")      # (T, 153)
print(f"Hands: {motion['left'].shape}")      # (T, 120)
print(f"Positions: {motion['positions'].shape}")  # (T, 63, 3)

# Load face
face = np.load(f"arkit_data/{name}.npy")
print(f"Face: {face.shape}")                 # (T_face, 51)

# Load audio
audio, sr = sf.read(f"wav_data/{name}.wav")
print(f"Audio: {audio.shape}, sr={sr}")

# Load text annotation
with open("text_data/motion2text.json") as f:
    motion2text = json.load(f)
print(f"Text: {motion2text[name]}")
```

### Convert to BVH (for visualization)

See [SentiAvatar](https://github.com/yourorg/SentiAvatar) for the visualization tool:

```bash
python tools/visualize_motion.py \
    --input SuSuInterActs/motion_data/path/to/sample.npy \
    --output output.bvh
```

## 📊 Data Distribution

<p align="center">
  <img src="duration_text_distribution.png" width="80%" alt="Duration and Text Distribution">
</p>

## 📝 Citation

If you use this dataset in your research, please cite:

```bibtex
@article{jin2026sentiavatar,
  title={SentiAvatar: Towards Expressive and Interactive Digital Humans},
  author={Jin, Chuhao and Zhang, Rui and Gao, Qingzhe and Shi, Haoyu and Wu, Dayu and Jiang, Yichen and Wu, Yihan and Song, Ruihua},
  journal={arXiv preprint arXiv:2604.02908},
  year={2026}
}
```

## License

This dataset is released under [CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0 International)](../SentiAvatar/LICENSE).

- ✅ Free for academic and non-commercial research
- ❌ Not permitted for commercial use
- 📧 Contact the authors for commercial licensing

## Acknowledgments

This dataset was captured at SentiPulse using professional optical motion capture equipment. We thank all participants and the annotation team for their contributions.