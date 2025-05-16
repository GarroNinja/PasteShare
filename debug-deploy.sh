#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare debug deployment...${NC}"

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

# Create a clean deployment folder
echo -e "${YELLOW}Creating clean deployment...${NC}"
rm -rf deploy
mkdir -p deploy/public
cp -r client/build/* deploy/public/

# Create a simple Express server that works
echo -e "${YELLOW}Creating simple Express server...${NC}"
cat > deploy/server.js << 'EOF'
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

// Create Express app
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());

// Database connection
let pool;
if (process.env.DATABASE_URL) {
  // Extract host from Cloud SQL unix socket path
  const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  };
  pool = new Pool(dbConfig);
  console.log('Database configuration loaded');
}

// API routes
app.get('/api/health', async (req, res) => {
  try {
    if (pool) {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      res.json({ 
        status: 'up', 
        db: 'connected',
        time: result.rows[0].now,
        env: process.env.NODE_ENV
      });
    } else {
      res.json({ 
        status: 'up', 
        db: 'not configured',
        env: process.env.NODE_ENV
      });
    }
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ 
      status: 'error', 
      message: err.message,
      env: process.env.NODE_ENV 
    });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// All other GET requests not handled serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Database URL configured: ${!!process.env.DATABASE_URL}`);
});
EOF

# Create a simple package.json
echo -e "${YELLOW}Creating package.json...${NC}"
cat > deploy/package.json << EOF
{
  "name": "pasteshare",
  "version": "1.0.0",
  "description": "A pastebin-like application for sharing code snippets and text",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3"
  }
}
EOF

# Create a simple Dockerfile
echo -e "${YELLOW}Creating Dockerfile...${NC}"
cat > deploy/Dockerfile << 'EOF'
FROM node:20-slim

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --production

# Copy the public directory with client files
COPY public/ ./public/

# Copy the server file
COPY server.js .

# Expose port
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD ["node", "server.js"]
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
  --set-env-vars="DATABASE_URL=postgres://postgres:$DB_PASSWORD@/pasteshare?host=/cloudsql/$PROJECT_ID:asia-south1:pasteshare-db,NODE_ENV=production" \
  --port=8080

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe pasteshare --platform managed --region asia-south1 --format "value(status.url)")

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Your application is available at: ${SERVICE_URL}" 