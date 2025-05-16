FROM node:20-slim

WORKDIR /app

# Copy package files 
COPY package.json ./
RUN npm install --production

# Copy built app
COPY dist/ ./dist/
COPY public/ ./public/

# Create uploads directory
RUN mkdir -p uploads && chmod 777 uploads

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start command
CMD ["node", "dist/static-server.js"]
