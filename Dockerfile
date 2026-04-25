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

# Run
CMD ["node", "dist/index.js"]
