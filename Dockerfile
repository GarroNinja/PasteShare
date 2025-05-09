FROM node:16-alpine as builder

WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm run install:all

# Copy source files
COPY . .

# Build the applications
RUN npm run build

# Production stage
FROM node:16-alpine

WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/client/build ./client/build
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/

# Install production dependencies only
RUN npm install --only=production
RUN cd server && npm install --only=production

# Create uploads directory
RUN mkdir -p uploads
RUN chmod 777 uploads

# Expose the application port
EXPOSE 3000

# Start the server
CMD ["node", "server/dist/server.js"] 