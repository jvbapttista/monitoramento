FROM python:3.15-slim-bookworm AS dependencies
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --require-hashes -r requirements.txt

FROM python:3.15-slim-bookworm AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app/backend
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \
    && mkdir /dados && chown app:app /dados && chmod 700 /dados
COPY --from=dependencies /opt/venv /opt/venv
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
USER 10001:10001
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8099/health/live', timeout=3)"]
# Um worker: coleta, cache e rate limit locais. Não usar --preload.
CMD ["gunicorn", "--bind", "0.0.0.0:8099", "--workers", "1", "--threads", "32", "--timeout", "120", "--graceful-timeout", "15", "--worker-tmp-dir", "/tmp", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
