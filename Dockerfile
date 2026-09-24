# Olares Junior Investor — single image: FastAPI API + prebuilt React SPA.
# Build the frontend first (apps/web: npm ci && npm run build) so apps/web/dist exists.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/static DATABASE_URL=sqlite:////data/junior_investor.db
WORKDIR /app
COPY apps/api/requirements.txt .
RUN pip install -r requirements.txt
COPY apps/api/ /app/
COPY apps/web/dist/ /app/static/
RUN rm -rf /app/tests /app/.env && mkdir -p /data \
    && useradd --uid 1000 --home-dir /data --no-create-home --shell /usr/sbin/nologin app \
    && chown -R 1000:1000 /app /data
ENV HOME=/data
USER 1000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
