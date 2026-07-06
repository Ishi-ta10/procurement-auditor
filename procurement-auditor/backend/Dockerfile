FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HUB_DISABLE_SYMLINKS=1

WORKDIR /app

# libgomp1 is required by onnxruntime (used by fastembed for the RAG/memory feature).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Idempotent DB bootstrap + seed, then launch the API.
# (Backfill RAG memory separately with: docker compose exec backend python seed_memory.py)
CMD ["sh", "-c", "python bootstrap.py && python seed.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
