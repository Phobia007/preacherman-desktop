"""Build explicit upper-body bindings from the packaged GLB skins (no asset mutation)."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'apps/preacherman-demo-host/public/assets/avatars'
keys = ['Spine', 'Chest', 'Neck', 'Head', 'Left_shoulder', 'Left_arm', 'Left_elbow', 'Left_wrist',
        'Right_shoulder', 'Right_arm', 'Right_elbow', 'Right_wrist']
families = [
    ['b_spine1', 'b_spine3', 'b_neck0', 'b_head', 'b_l_clav', 'b_l_upperarm', 'b_l_forearm', 'b_l_hand', 'b_r_clav', 'b_r_upperarm', 'b_r_forearm', 'b_r_hand'],
    ['mixamorig:Spine', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand', 'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand'],
    ['spine_01.x', 'spine_03.x', 'neck.x', 'head.x', 'shoulder.l', 'arm_stretch.l', 'forearm_stretch.l', 'hand.l', 'shoulder.r', 'arm_stretch.r', 'forearm_stretch.r', 'hand.r'],
    ['spine_02', 'spine_05', 'neck_01', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'],
    ['C_Spine_b', 'C_Spine_d', 'C_Neck_a', 'C_Head_a', 'L_Shoulder_a', 'L_UpperArm_a', 'L_Forearm_a', 'L_Hand_a', 'R_Shoulder_a', 'R_UpperArm_a', 'R_Forearm_a', 'R_Hand_a'],
    ['DEF-Spine_02', 'DEF-Spine_04', 'DEF-Neck_01', 'DEF-Head', 'DEF-Shoulder.L', 'DEF-Upperarm.L', 'DEF-Forearm.L', 'DEF-Hand.L', 'DEF-Shoulder.R', 'DEF-Upperarm.R', 'DEF-Forearm.R', 'DEF-Hand.R'],
    ['Spine2', 'Spine4', 'Neck', 'Head', 'L_Clavicle', 'L_Shoulder', 'L_Elbow', 'L_Hand', 'R_Clavicle', 'R_Shoulder', 'R_Elbow', 'R_Hand'],
    ['spine.001', 'spine.003', 'spine.004', 'spine.006', 'shoulder.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'shoulder.R', 'upper_arm.R', 'forearm.R', 'hand.R'],
    ['def_c_spineA', 'def_c_spineC', 'def_c_neckA', 'def_c_head', 'def_l_clav', 'def_l_shoulder', 'def_l_forearm', 'def_l_wrist', 'def_r_clav', 'def_r_shoulder', 'def_r_forearm', 'def_r_wrist'],
    ['spine 2', 'spine 4', 'head neck lower', 'head neck upper', 'arm left shoulder 1', 'arm left shoulder 2', 'arm left elbow', 'arm left wrist', 'arm right shoulder 1', 'arm right shoulder 2', 'arm right elbow', 'arm right wrist'],
    ['Bip001-Spine', 'Bip001-Spine2', 'Bip001-Neck', 'Bip001-Head', 'Bip001-L-Clavicle', 'Bip001-L-UpperArm', 'Bip001-L-Forearm', 'Bip001-L-Hand', 'Bip001-R-Clavicle', 'Bip001-R-UpperArm', 'Bip001-R-Forearm', 'Bip001-R-Hand'],
]
profiles = {}
for path in sorted(ASSETS.glob('*/*runtime.glb')):
    with path.open('rb') as stream:
        stream.seek(12)
        length, _ = struct.unpack('<II', stream.read(8))
        gltf = json.loads(stream.read(length))
    names = {gltf['nodes'][joint].get('name', '') for skin in gltf.get('skins', []) for joint in skin['joints']}
    candidates = [dict((key, name) for key, name in zip(keys, family) if name in names) for family in families]
    bones = max(candidates, key=len)
    if not {'Spine', 'Chest', 'Neck', 'Head'} <= bones.keys():
        raise ValueError(f'Unreviewed torso binding: {path.parent.name}')
    # Sculpted print figures retain their support-arm pose; only animate the torso.
    if path.parent.name.startswith('nier-print-'):
        bones = {key: value for key, value in bones.items() if key in keys[:4]}
    assert len(set(bones.values())) == len(bones)
    profiles[path.parent.name] = {
        'bones': bones,
        'defaultStyle': 'subtle' if any(word in path.parent.name for word in ('halo', 'spartan', 'iron-man', 'robot', 'pathfinder', 'knight', 'halloween', 'nier-print')) else 'natural',
    }
target = ROOT / 'apps/preacherman-demo-host/src/motion/characterMotionRigs.json'
target.write_text(json.dumps(profiles, indent=2) + '\n', encoding='utf-8')
print(f'Validated {len(profiles)} character skins; all mappings exclude root, legs and fingers.')
