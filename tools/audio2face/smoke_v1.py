from __future__ import annotations

import argparse
import asyncio
import json
import uuid

import numpy as np
import websockets

from audio2face.data_structures import audio2face_v1_pb2


async def smoke(endpoint: str, duration: float) -> dict:
    request_id = str(uuid.uuid4())
    sample_rate = 16000
    time = np.arange(int(sample_rate * duration), dtype=np.float32) / sample_rate
    envelope = np.sin(np.pi * np.minimum(time / max(duration, 0.1), 1.0))
    pcm = (np.sin(2 * np.pi * 180 * time) * envelope * 9000).astype(np.int16)
    start = audio2face_v1_pb2.Audio2FaceBlendshapeV1Request(
        class_name="StreamingAudio2FaceV1ChunkStart",
        request_id=request_id,
        sample_rate=sample_rate,
        sample_width=2,
        n_channels=1,
        profile_name="KQ-default",
        response_chunk_n_frames=30,
    )
    end = audio2face_v1_pb2.Audio2FaceBlendshapeV1Request(
        class_name="StreamingAudio2FaceV1ChunkEnd",
        request_id=request_id,
    )
    names: list[str] = []
    dtype = ""
    data_bytes = 0
    terminal = False
    async with websockets.connect(endpoint, max_size=None) as websocket:
        await websocket.send(start.SerializeToString())
        # This smoke test submits buffered audio. A single bounded chunk avoids
        # measuring EnergySplit call overhead instead of model inference.
        step = int(sample_rate * 5)
        for offset in range(0, len(pcm), step):
            body = audio2face_v1_pb2.Audio2FaceBlendshapeV1Request(
                class_name="StreamingAudio2FaceV1ChunkBody",
                request_id=request_id,
                pcm_bytes=pcm[offset:offset + step].tobytes(),
            )
            await websocket.send(body.SerializeToString())
        await websocket.send(end.SerializeToString())
        while not terminal:
            response = audio2face_v1_pb2.Audio2FaceBlendshapeV1Response()
            response.ParseFromString(await asyncio.wait_for(websocket.recv(), 60))
            if response.class_name == "Audio2FaceV1ResponseChunkStart":
                names = list(response.blendshape_names)
                dtype = response.dtype
            elif response.class_name == "Audio2FaceV1ResponseChunkBody":
                data_bytes += len(response.data)
            elif response.class_name == "Audio2FaceV1ResponseChunkEnd":
                terminal = True
    item_size = np.dtype(dtype).itemsize if dtype else 0
    frame_count = data_bytes // (len(names) * item_size) if names and item_size else 0
    if not terminal or frame_count == 0:
        raise RuntimeError("Audio2Face returned no facial animation frames.")
    return {
        "service": "audio2face-v1",
        "state": "ready",
        "blendshapeCount": len(names),
        "frameCount": frame_count,
        "dtype": dtype,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="ws://127.0.0.1:18083/api/v1/streaming_audio2face/ws")
    parser.add_argument("--duration", default=2.0, type=float)
    values = parser.parse_args()
    print(json.dumps(asyncio.run(smoke(values.endpoint, values.duration)), ensure_ascii=False, indent=2))
