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
RUN echo "🔍 Running curl diagnostic..." && \
    echo "=== Test 1: SALON BOARD ===" && \
    curl -v -m 10 https://salonboard.com/ 2>&1 | head -50 && \
    echo "" && \
    echo "=== Test 2: Google ===" && \
    curl -v -m 10 https://www.google.com/ 2>&1 | head -20 && \
    echo "" && \
    echo "✅ Curl diagnostic complete"

# Run
CMD ["node", "dist/index.js"]
