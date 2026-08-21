from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from pathlib import Path

import numpy as np
import websockets

from speech2motion.io.protobuf import streaming_v3_pb2


async def run_smoke_test(
    endpoint: str,
    avatar: str,
    text: str,
    duration: float,
    output: str | None,
    app_name: str,
) -> dict:
    request_id = str(uuid.uuid4())
    start = streaming_v3_pb2.Speech2MotionV3Request(
        class_name="StreamingSpeech2MotionV3ChunkStart",
        request_id=request_id,
        user_id="preacherman-local-test",
        avatar=avatar,
        app_name=app_name,
        max_front_extension_duration=1.0,
        max_rear_extension_duration=2.0,
        response_chunk_n_frames_value=90,
    )
    body = streaming_v3_pb2.Speech2MotionV3Request(
        class_name="StreamingSpeech2MotionV3ChunkBody",
        request_id=request_id,
        duration=duration,
        speech_text=text,
        sequence_number=0,
    )
    end = streaming_v3_pb2.Speech2MotionV3Request(
        class_name="StreamingSpeech2MotionV3ChunkEnd",
        request_id=request_id,
    )

    joint_names: list[str] = []
    restpose_name = ""
    dtype = ""
    timeline_start_idx: int | None = None
    blendshape_names: list[str] = []
    motion_payloads: list[bytes] = []
    motion_bytes = 0
    body_chunks = 0
    terminal_received = False

    async with websockets.connect(endpoint, max_size=None) as websocket:
        await websocket.send(start.SerializeToString())
        await websocket.send(body.SerializeToString())
        await websocket.send(end.SerializeToString())

        while not terminal_received:
            response = streaming_v3_pb2.Speech2MotionV3Response()
            response.ParseFromString(await asyncio.wait_for(websocket.recv(), timeout=30))
            if response.class_name == "Speech2MotionV3ResponseChunkStart":
                joint_names = list(response.joint_names)
                restpose_name = response.restpose_name
                dtype = response.dtype
                blendshape_names = list(response.blendshape_names)
                if response.HasField("timeline_start_idx_value"):
                    timeline_start_idx = response.timeline_start_idx_value
            elif response.class_name == "Speech2MotionV3ResponseChunkBody":
                motion_bytes += len(response.data)
                body_chunks += 1
                motion_payloads.append(response.data)
            elif response.class_name == "Speech2MotionV3ResponseChunkEnd":
                terminal_received = True

    if not joint_names or motion_bytes == 0 or not terminal_received:
        raise RuntimeError("Speech2Motion V3 did not return a complete motion stream.")

    output_path = None
    frame_count = 0
    if output:
        numpy_dtype = np.dtype(dtype)
        values_per_frame = len(joint_names) * 9 + 3 + 3 + len(blendshape_names)
        flat_motion = np.frombuffer(b"".join(motion_payloads), dtype=numpy_dtype)
        if flat_motion.size % values_per_frame != 0:
            raise RuntimeError("Speech2Motion returned a malformed frame payload.")
        frames = flat_motion.reshape(-1, values_per_frame)
        frame_count = frames.shape[0]
        rotations_end = len(joint_names) * 9
        root_end = rotations_end + 3
        cutoff_end = root_end + 3
        output_path = Path(output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            output_path,
            joint_names=np.asarray(joint_names),
            restpose_name=np.asarray(restpose_name),
            joint_rotmat=frames[:, :rotations_end].reshape(
                frame_count, len(joint_names), 3, 3
            ),
            root_world_position=frames[:, rotations_end:root_end],
            cutoff_marks=frames[:, root_end:cutoff_end],
            blendshape_names=np.asarray(blendshape_names),
            blendshape_values=frames[:, cutoff_end:],
            timeline_start_idx=np.asarray(
                -1 if timeline_start_idx is None else timeline_start_idx
            ),
        )

    return {
        "service": "speech2motion-v3",
        "state": "ready",
        "requestId": request_id,
        "avatar": avatar,
        "appName": app_name,
        "restpose": restpose_name,
        "dtype": dtype,
        "jointCount": len(joint_names),
        "jointNames": joint_names,
        "bodyChunks": body_chunks,
        "motionBytes": motion_bytes,
        "frameCount": frame_count,
        "output": str(output_path) if output_path else None,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--endpoint",
        default="ws://127.0.0.1:18084/api/v3/streaming_speech2motion/ws",
    )
    parser.add_argument("--avatar", default="KQ-default")
    parser.add_argument("--text", default="我明白了，让我认真想一想。")
    parser.add_argument("--duration", type=float, default=3.2)
    parser.add_argument("--output")
    parser.add_argument(
        "--app-name",
        choices=("python_backend", "babylon"),
        default="python_backend",
    )
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    result = asyncio.run(
        run_smoke_test(
            arguments.endpoint,
            arguments.avatar,
            arguments.text,
            arguments.duration,
            arguments.output,
            arguments.app_name,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
