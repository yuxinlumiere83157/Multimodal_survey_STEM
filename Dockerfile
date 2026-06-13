FROM node:22-slim AS client-build

WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only torch FIRST (smaller image, no CUDA wheels).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision

# Remaining deps (torch/torchvision intentionally absent from this file).
COPY requirements-cpu.txt .
RUN pip install -r requirements-cpu.txt

# App code + model. Model MUST sit beside the code because API.py loads it via
# a relative path and WORKDIR is /app.
COPY API.py app_demo.py ./
COPY torchscript_model_0_66_49_wo_gl.pth ./
COPY --from=client-build /client/dist ./client/dist

EXPOSE 7860

# 1 worker (model memory) + generous timeout (slow CPU cold start / first inference).
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "120", "app_demo:app"]
