FROM node:22-slim AS client-build

WORKDIR /client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only PyTorch wheels so the Docker image does not pull CUDA builds.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision

COPY requirements-cpu.txt .
RUN pip install -r requirements-cpu.txt

COPY API.py app_research_space.py ./
COPY torchscript_model_0_66_49_wo_gl.pth ./
RUN python -c "import os, sys; p='torchscript_model_0_66_49_wo_gl.pth'; s=os.path.getsize(p); sys.exit(f'LFS pointer or missing model: {s} bytes') if s < 1000000 else print('model OK', s)"

COPY --from=client-build /client/dist ./client/dist

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "180", "app_research_space:app"]
