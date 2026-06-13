from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from PIL import Image
from torchvision import transforms


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "torchscript_model_0_66_49_wo_gl.pth"
DEFAULT_OUTPUT = ROOT / "client" / "public" / "models" / "fer_model.onnx"
DEFAULT_TEST_IMAGE = ROOT.parent / "robinhuang-site" / "src" / "assets" / "profile_pictures.jpg"


class PreprocessInput(torch.nn.Module):
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x.to(torch.float32)
        x = torch.flip(x, dims=(0,))
        x[0, :, :] -= 91.4953
        x[1, :, :] -= 103.8827
        x[2, :, :] -= 131.0912
        return x


def preprocess_image(path: Path) -> torch.Tensor:
    image = Image.open(path).convert("RGB").resize((224, 224), Image.Resampling.NEAREST)
    transform = transforms.Compose([transforms.PILToTensor(), PreprocessInput()])
    return transform(image).unsqueeze(0)


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / np.sum(exp, axis=1, keepdims=True)


def compare_outputs(label: str, torch_logits: torch.Tensor, ort_logits: np.ndarray) -> None:
    torch_np = torch_logits.detach().cpu().numpy()
    max_abs = float(np.max(np.abs(torch_np - ort_logits)))
    mean_abs = float(np.mean(np.abs(torch_np - ort_logits)))
    torch_probs = softmax(torch_np)
    ort_probs = softmax(ort_logits)
    print(
        f"{label}: max_abs={max_abs:.8f} mean_abs={mean_abs:.8f} "
        f"torch_class={int(torch_probs.argmax(axis=1)[0])} "
        f"onnx_class={int(ort_probs.argmax(axis=1)[0])}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export FER TorchScript model to ONNX and validate parity.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--test-image", type=Path, default=DEFAULT_TEST_IMAGE)
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)

    torch.set_num_threads(1)
    model = torch.jit.load(str(MODEL_PATH), map_location="cpu").eval()
    dummy = torch.zeros(1, 3, 224, 224, dtype=torch.float32)

    torch.onnx.export(
        model,
        dummy,
        str(args.output),
        input_names=["input"],
        output_names=["logits"],
        opset_version=args.opset,
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        dynamo=False,
    )

    onnx_model = onnx.load(str(args.output))
    onnx.checker.check_model(onnx_model)

    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])

    test_inputs = [
        ("zeros", dummy),
        ("random", torch.randn(1, 3, 224, 224, dtype=torch.float32)),
    ]
    if args.test_image.exists():
        test_inputs.append((f"image:{args.test_image.name}", preprocess_image(args.test_image)))

    with torch.no_grad():
        for label, tensor in test_inputs:
            torch_logits = model(tensor)
            ort_logits = session.run(["logits"], {"input": tensor.detach().cpu().numpy()})[0]
            compare_outputs(label, torch_logits, ort_logits)

    print(f"exported={args.output}")
    print(f"bytes={args.output.stat().st_size}")


if __name__ == "__main__":
    main()
