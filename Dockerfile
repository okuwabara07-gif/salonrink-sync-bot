FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build
RUN npm run build

# Set environment
ENV NODE_ENV=production

# TODO: Remove this diagnostic after debugging
RUN set -x && \
    echo "🔍 Running curl diagnostic..." && \
    echo "=== Test 1: SALON BOARD ===" && \
    curl -v -m 10 https://salonboard.com/ > /tmp/sb.log 2>&1; \
    echo "Exit code: $?" && \
    cat /tmp/sb.log | head -80 && \
    echo "" && \
    echo "=== Test 2: Google ===" && \
    curl -v -m 10 https://www.google.com/ > /tmp/g.log 2>&1; \
    echo "Exit code: $?" && \
    cat /tmp/g.log | head -30 && \
    echo "" && \
    echo "=== Test 3: DNS ===" && \
    (getent hosts salonboard.com || echo "DNS failed") && \
    (getent hosts www.google.com || echo "DNS failed") && \
    echo "✅ Curl diagnostic complete"

# Run
CMD ["node", "dist/index.js"]
