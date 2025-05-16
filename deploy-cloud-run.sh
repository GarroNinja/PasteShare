#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare deployment to Cloud Run...${NC}"

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

# Enable required services
echo -e "${YELLOW}Enabling required services...${NC}"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com sqladmin.googleapis.com

# Build both client and server
echo -e "${YELLOW}Building client...${NC}"
cd client
npm install
npm run build
cd ..

echo -e "${YELLOW}Building server...${NC}"
cd server
npm install
npm run build

# Copy client build to server public directory
echo -e "${YELLOW}Copying client build to server...${NC}"
mkdir -p dist/public
cp -r ../client/build/* dist/public/

# Update server.ts to serve static files from public directory
echo -e "${YELLOW}Updating permissions...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_ID-compute@developer.gserviceaccount.com \
  --role=roles/cloudsql.client

# Build and deploy to Cloud Run
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"
gcloud builds submit --tag gcr.io/$PROJECT_ID/pasteshare

# Deploy to Cloud Run with Cloud SQL connection
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

gcloud sql instances create pasteshare-db \
  --database-version=POSTGRES_13 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10GB \
  --root-password=YOUR_SECURE_PASSWORD 