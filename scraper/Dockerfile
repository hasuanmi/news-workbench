FROM python:3.12-slim

WORKDIR /app

# 是否安装 Playwright 浏览器（约 20 家 JS 渲染站点需要）。
# 默认 false：镜像轻量、构建快，纯 HTTP 模式即可覆盖约 70 家媒体。
# 需要时：docker build --build-arg WITH_PLAYWRIGHT=true .
ARG WITH_PLAYWRIGHT=false

# 浏览器运行所需系统库（仅 WITH_PLAYWRIGHT=true 时安装）
RUN if [ "$WITH_PLAYWRIGHT" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 fonts-liberation \
      && rm -rf /var/lib/apt/lists/*; \
    fi

COPY requirements.txt requirements-playwright.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# 可选：安装 playwright 并下载 Chromium
RUN if [ "$WITH_PLAYWRIGHT" = "true" ]; then \
      pip install --no-cache-dir -r requirements-playwright.txt \
      && playwright install chromium; \
    fi

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["python", "-m", "app.main"]
