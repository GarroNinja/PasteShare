# PasteShare Deployment Guide

## Vercel Deployment (Recommended)

1. **Prepare your repository**
   - Fork or clone this repository to your GitHub account
   - Push any changes you want to make

2. **Set up a PostgreSQL database**
   - Option 1: [Supabase](https://supabase.com) (Recommended)
   - Option 2: [Neon](https://neon.tech)
   - Option 3: [Vercel Postgres](https://vercel.com/storage/postgres)
   - Copy your PostgreSQL connection string

3. **Deploy to Vercel**
   - Connect your GitHub repository to Vercel
   - Add the following environment variables:
     - `DATABASE_URL`: Your PostgreSQL connection string
     - `NODE_ENV`: `production`
   - Deploy the project

4. **Troubleshooting**
   - If pastes don't persist, check the Vercel function logs
   - Verify your DATABASE_URL is correctly set
   - Check the Supabase connection in your project settings

## Local Development

1. **Environment Setup**
   ```bash
   # Create a .env file in the server directory
   echo "DATABASE_URL=postgres://username:password@localhost:5432/pasteshare" > server/.env
   echo "NODE_ENV=development" >> server/.env
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

## Advanced Deployment Options

For advanced deployment options (Docker, VPS), check the [GitHub Wiki](https://github.com/YOUR_USERNAME/PasteShare/wiki). 