FROM mcr.microsoft.com/playwright:v1.48.2-bookworm

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

# Run
CMD ["node", "dist/index.js"]
