#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare fix and deployment...${NC}"

# Set project ID
PROJECT_ID="coastal-bloom-460014-j6"

# Make sure gcloud is configured
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Ask for database password
read -sp "Enter your database password: " DB_PASSWORD
echo ""  # New line after password entry
if [ -z "$DB_PASSWORD" ]; then
  echo "Database password cannot be empty. Exiting."
  exit 1
fi

# Build client
echo -e "${YELLOW}Building client...${NC}"
cd client
npm install
npm run build
cd ..

# Create a combined deployment
echo -e "${YELLOW}Creating combined deployment...${NC}"
mkdir -p deploy
cp -r client/build deploy/public

# Create server directory in deploy
mkdir -p deploy/dist
cd server
npm install
npm run build
cd ..
cp -r server/dist/* deploy/dist/

# Create a proper Dockerfile for the combined app
echo -e "${YELLOW}Creating Dockerfile...${NC}"
cat > deploy/Dockerfile << 'EOF'
FROM node:20-slim

WORKDIR /app

# Copy package files 
COPY package.json ./
RUN npm install --omit=dev

# Copy built app
COPY dist/ ./dist/
COPY public/ ./public/

# Create uploads directory
RUN mkdir -p uploads && chmod 777 uploads

# Expose port
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD ["node", "dist/static-server.js"]
EOF

# Create a server.js wrapper to serve static files
echo -e "${YELLOW}Creating server wrapper...${NC}"
cat > deploy/dist/static-server.js << 'EOF'
// Add static file serving to the server
const express = require('express');
const path = require('path');
const app = require('./server').default || require('./server');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// For any other routes, serve the index.html file
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api')) return;
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
EOF

# Create simplified package.json
cat > deploy/package.json << EOF
{
  "name": "pasteshare",
  "version": "1.0.0",
  "description": "A pastebin-like application for sharing code snippets and text",
  "main": "dist/static-server.js",
  "scripts": {
    "start": "node dist/static-server.js"
  },
  "dependencies": {
    "pg": "^8.11.3",
    "pg-hstore": "^2.3.4",
    "sequelize": "^6.37.1",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "morgan": "^1.10.0"
  }
}
EOF

# Enable required services
echo -e "${YELLOW}Enabling required services...${NC}"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com sqladmin.googleapis.com

# Build and deploy to Cloud Run
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"
cd deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/pasteshare .

# Deploy to Cloud Run with Cloud SQL connection
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy pasteshare \
  --image gcr.io/$PROJECT_ID/pasteshare \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --add-cloudsql-instances $PROJECT_ID:asia-south1:pasteshare-db \
  --set-env-vars="DATABASE_URL=postgres://postgres:$DB_PASSWORD@/pasteshare?host=/cloudsql/$PROJECT_ID:asia-south1:pasteshare-db,NODE_ENV=production"

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe pasteshare --platform managed --region asia-south1 --format "value(status.url)")

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Your application is available at: ${SERVICE_URL}" 