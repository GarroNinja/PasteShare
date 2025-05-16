#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting PasteShare deployment to Google Cloud...${NC}"

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

# Update app.yaml files with project ID and password
echo -e "${YELLOW}Updating deployment configurations...${NC}"
sed -i.bak "s/YOUR_PROJECT_ID/$PROJECT_ID/g" server/app.yaml
sed -i.bak "s/YOUR_SECURE_PASSWORD/$DB_PASSWORD/g" server/app.yaml
rm server/app.yaml.bak

# Deploy the frontend (default service) first
echo -e "${YELLOW}Deploying frontend service (default)...${NC}"
cd client
gcloud app deploy --quiet
cd ..

# Then deploy API service
echo -e "${YELLOW}Deploying API service...${NC}"
cd server
gcloud app deploy --quiet
cd ..

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Your application should be available at: https://$PROJECT_ID.appspot.com"
echo -e "API service is available at: https://api-dot-$PROJECT_ID.appspot.com" 