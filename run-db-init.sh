#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}PasteShare Database Initialization...${NC}"

# Set project ID
PROJECT_ID="coastal-bloom-460014-j6"

# Make sure gcloud is configured
echo -e "${YELLOW}Checking gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Ask for database password
read -sp "Enter your database password: " DB_PASSWORD
echo ""  # New line after password entry
if [ -z "$DB_PASSWORD" ]; then
  echo -e "${RED}Database password cannot be empty. Exiting.${NC}"
  exit 1
fi

# Construct the database URL for Cloud SQL
DATABASE_URL="postgres://postgres:$DB_PASSWORD@/pasteshare?host=/cloudsql/$PROJECT_ID:asia-south1:pasteshare-db"
echo -e "${YELLOW}Database URL constructed.${NC}"

# Install required packages for the initialization script
echo -e "${YELLOW}Installing required packages...${NC}"
npm install --no-save sequelize pg pg-hstore dotenv

# Run the database initialization script with the DATABASE_URL
echo -e "${YELLOW}Running database initialization script...${NC}"
DATABASE_URL="$DATABASE_URL" node init-cloud-db.js

# Check if the initialization was successful
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Database initialization completed successfully!${NC}"
  echo -e "${GREEN}You can now deploy your application with ./fix-deploy-cloud-run.sh${NC}"
else
  echo -e "${RED}Database initialization failed. Please check the error messages above.${NC}"
  exit 1
fi 