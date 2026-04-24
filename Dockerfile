# Build stage
FROM node:20-bookworm AS builder

WORKDIR /app

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-driver \
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

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Install Playwright with chromium
RUN npx playwright install chromium --with-deps

# Copy source code
COPY src ./src

# Build
RUN npm run build

# Runtime stage
FROM node:20-bookworm

WORKDIR /app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
  chromium \
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

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy Playwright binaries
COPY --from=builder /root/.cache/ms-playwright ./ms-playwright

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Run the application
CMD ["node", "dist/index.js"]
