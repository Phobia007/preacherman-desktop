"""Start Audio2Face without its five-request eager warmup loop."""

from __future__ import annotations

import argparse

import onnxruntime

# ONNX Runtime's CUDA provider does not automatically add pip-installed NVIDIA
# DLL folders to Windows' loader path. Preload them before Audio2Face creates
# its inference session; this is a no-op for the CPU-only installation.
if "CUDAExecutionProvider" in onnxruntime.get_available_providers():
    onnxruntime.preload_dlls(directory="")

from audio2face.service.server import FastAPIServer
from audio2face.utils.config import file2dict


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/cpu.py")
    arguments = parser.parse_args()
    startup_config = file2dict(arguments.config)
    if startup_config.pop("type") != "FastAPIServer":
        raise RuntimeError("Audio2Face config must use FastAPIServer.")
    server = FastAPIServer(**startup_config)
    actual_providers = server.python_api.unitalker.unitalker_sessions[0].get_providers()
    print(f"Audio2Face active providers: {actual_providers}", flush=True)
    # Upstream performs five full ONNX inferences before opening the port. On
    # desktop CPUs this can take many minutes. Real requests still
    # use the unmodified inference pipeline; only eager warmup is skipped.
    server.app.router.on_startup.clear()
    server.run()


if __name__ == "__main__":
    main()
