# Reflow scheduler — deploys as-is to Railway or Fly.io (both build from a
# Dockerfile). PORT is injected by the platform; defaults to 8000 locally.
FROM python:3.12-slim

WORKDIR /app

# Install deps first (cache-friendly), then the app.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
