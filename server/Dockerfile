# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files from both server and api directories
COPY server/package*.json ./server/
COPY api/package*.json ./api/

# Install server dependencies
WORKDIR /app/server
RUN npm ci --only=production

# Install api dependencies
WORKDIR /app/api
RUN npm ci --only=production

# Copy source code
WORKDIR /app
COPY server/ ./server/
COPY api/ ./api/

# Build TypeScript
WORKDIR /app/server
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built application and dependencies
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package*.json ./server/
COPY --from=build /app/api ./api

# Create uploads directory
RUN mkdir -p /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server/dist/server.js"] 