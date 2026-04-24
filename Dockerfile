FROM node:20-bookworm

WORKDIR /app

# Install system packages including Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-sandbox \
  libxkbcommon0 \
  libxcb1 \
  libxrandr2 \
  libdbus-1-3 \
  libgconf-2-4 \
  libgbm1 \
  libnss3 \
  libxss1 \
  libappindicator3-1 \
  libxshmfence1 \
  fonts-liberation \
  xdg-utils \
  libatk-bridge2.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libcurl4 \
  libdrm2 \
  libglib2.0-0 \
  libgtk-3-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  libxext6 \
  libxfixes3 \
  && rm -rf /var/lib/apt/lists/*

# Copy files
COPY package*.json ./
COPY tsconfig.json ./

# Install npm dependencies
RUN npm ci

# Install Playwright (uses system Chromium)
RUN npx playwright install chromium --with-deps

# Copy source
COPY src ./src

# Build
RUN npm run build

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

# Set environment
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Run
ENTRYPOINT ["./entrypoint.sh"]
