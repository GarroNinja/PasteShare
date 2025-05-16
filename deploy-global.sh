#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare global deployment to Google Cloud...${NC}"

# Set project ID
PROJECT_ID="coastal-bloom-460014-j6"

# Make sure gcloud is configured
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Build the client
echo -e "${YELLOW}Building client...${NC}"
cd client
npm install
npm run build
cd ..

# Build the server
echo -e "${YELLOW}Building server...${NC}"
cd server
npm install
npm run build
cd ..

# Create server copy in root
echo -e "${YELLOW}Preparing server files...${NC}"
mkdir -p dist
cp -r server/dist/* dist/
cp -r server/node_modules ./node_modules

# Grant needed permissions to service account
echo -e "${YELLOW}Setting up service account permissions...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com \
  --role=roles/storage.admin

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com \
  --role=roles/cloudsql.client

# Deploy the application
echo -e "${YELLOW}Deploying application...${NC}"
gcloud app deploy --quiet

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Your application should be available at: https://$PROJECT_ID.el.r.appspot.com" 