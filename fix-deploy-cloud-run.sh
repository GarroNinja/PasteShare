#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare fixed deployment...${NC}"

# Set project ID
PROJECT_ID="coastal-bloom-460014-j6"
REGION="asia-south1"
DB_INSTANCE="pasteshare-db"
SERVICE_NAME="pasteshare"

# Make sure gcloud is configured
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Prompt for database password
read -sp "Enter your database password: " DB_PASSWORD
echo ""

# Ask if we should initialize the database
read -p "Do you want to initialize the database? (y/n) " INIT_DB
echo ""

if [[ "$INIT_DB" == "y" || "$INIT_DB" == "Y" ]]; then
  echo -e "${YELLOW}Initializing database...${NC}"
  
  # Install required dependencies
  npm install --no-save pg pg-hstore sequelize
  
  # =============================
  # Start Cloud SQL Proxy for local access
  # =============================
  echo -e "${YELLOW}Starting Cloud SQL Proxy...${NC}"
  
  # Ensure we have the necessary authentication
  gcloud auth application-default login --no-launch-browser
  
  # Get the instance connection name
  INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$DB_INSTANCE"
  
  # Start Cloud SQL Proxy in the background
  cloud-sql-proxy --port=5432 "$INSTANCE_CONNECTION_NAME" &
  PROXY_PID=$!
  
  # Wait for proxy to start
  sleep 5
  
  # Check if proxy is running
  if kill -0 $PROXY_PID 2>/dev/null; then
    echo -e "${GREEN}Cloud SQL Proxy started successfully with PID: $PROXY_PID${NC}"
  else
    echo -e "${RED}Failed to start Cloud SQL Proxy. Please check for errors and try again.${NC}"
    exit 1
  fi
  
  # Run the initialization script
  echo -e "${YELLOW}Starting database initialization...${NC}"
  export DB_PASSWORD="$DB_PASSWORD"
  node init-cloud-db-local.js
  
  # Store the result
  INIT_RESULT=$?
  
  # Stop the proxy
  echo -e "${YELLOW}Stopping Cloud SQL Proxy...${NC}"
  kill $PROXY_PID
  wait $PROXY_PID 2>/dev/null || true
  
  # Check if initialization was successful
  if [ $INIT_RESULT -ne 0 ]; then
    echo -e "${RED}Database initialization failed. Please fix the issues before deploying.${NC}"
    exit 1
  fi
fi

# =============================
# Build and deploy to Cloud Run
# =============================
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"

# Ask for confirmation before proceeding with deployment
read -p "Ready to deploy. Continue? (y/n) " CONTINUE
if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
  echo -e "${YELLOW}Deployment cancelled.${NC}"
  exit 0
fi

# Build client
echo -e "${YELLOW}Building client...${NC}"
cd client
npm install
npm run build
cd ..

# Build server
echo -e "${YELLOW}Building server...${NC}"
cd server
npm install
npm run build
cd ..

# Create a temporary deployment directory
echo -e "${YELLOW}Preparing deployment package...${NC}"
DEPLOY_DIR=$(mktemp -d)

# Copy necessary files
cp -r server/dist $DEPLOY_DIR/
cp -r client/build $DEPLOY_DIR/public
cp server/package.json $DEPLOY_DIR/
cp server/package-lock.json $DEPLOY_DIR/

# Create Dockerfile for Cloud Run
cat > $DEPLOY_DIR/Dockerfile << EOF
FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY public/ ./public/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/server.js"]
EOF

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud builds submit $DEPLOY_DIR --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Format the proper Cloud SQL connection URL
INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$DB_INSTANCE"
DB_URL="postgres://postgres:$DB_PASSWORD@localhost/pasteshare?host=/cloudsql/$INSTANCE_CONNECTION_NAME"

# Deploy the container to Cloud Run with higher timeout and more resources
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=$DB_URL" \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
  --timeout=300s \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=2

# Clean up temp directory
rm -rf $DEPLOY_DIR

# Display success message
echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${GREEN}Your application should now be running on Cloud Run.${NC}"
gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(status.url)" 