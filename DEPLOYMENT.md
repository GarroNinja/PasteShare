# PasteShare Deployment Guide

This guide provides step-by-step instructions for deploying the PasteShare application to various platforms.

## Prerequisites

- Node.js 16+ and npm installed
- Git for cloning the repository
- PostgreSQL database
- Basic knowledge of command line operations

## Project Structure

PasteShare consists of two main components:
- **Client**: React frontend application
- **Server**: Node.js/Express backend API

## Configuration Files

### Client Configuration

Create a `.env.production` file in the `client/` directory with the following content:

```
REACT_APP_API_URL=/api
GENERATE_SOURCEMAP=false
```

### Server Configuration

Create a `.env.production` file in the `server/` directory with the following content:

```
PORT=3000
NODE_ENV=production
UPLOAD_DIR=./uploads
DATABASE_URL=postgres://username:password@host:port/pasteshare
JWT_SECRET=your_secure_random_string
```

Replace `username`, `password`, `host`, `port` with your PostgreSQL database credentials.

## Building for Production

Run the following command to build both the client and server applications:

```bash
npm run build
```

This will create:
- A production-ready frontend build in `client/build/`
- A compiled backend in `server/dist/`

## Deployment Options

### Option 1: Traditional Hosting (VPS, Dedicated Server)

1. Clone your repository on the server
2. Set up environment variables
3. Install and configure PostgreSQL
   ```bash
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   sudo -u postgres createdb pasteshare
   sudo -u postgres psql -c "CREATE USER pasteshare_user WITH PASSWORD 'your_password';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pasteshare TO pasteshare_user;"
   ```
4. Build the application
5. Configure a reverse proxy (Nginx/Apache) to serve the application
6. Use PM2 to manage the Node.js process

#### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        root /path/to/pasteshare/client/build;
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### PM2 Startup

```bash
npm install -g pm2
cd /path/to/pasteshare
pm2 start server/dist/server.js --name "pasteshare"
pm2 save
pm2 startup
```

### Option 2: Docker Deployment

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:16-alpine as builder

WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm run install:all

COPY . .
RUN npm run build

FROM node:16-alpine

WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/client/build ./client/build
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/

RUN npm install --only=production

EXPOSE 3000

CMD ["node", "server/dist/server.js"]
```

Update the `docker-compose.yml` file to include PostgreSQL:

```yaml
version: '3'
services:
  pasteshare:
    build: .
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - UPLOAD_DIR=./uploads
      - DATABASE_URL=postgres://pasteshare:pasteshare@postgres:5432/pasteshare
      - JWT_SECRET=change_this_to_a_secure_random_string
    volumes:
      - pasteshare_uploads:/app/uploads
    depends_on:
      - postgres

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=pasteshare
      - POSTGRES_PASSWORD=pasteshare
      - POSTGRES_DB=pasteshare
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  pasteshare_uploads:
  postgres_data:
```

### Option 3: Platform-as-a-Service (PaaS)

#### Heroku Deployment

1. Install Heroku CLI and login
2. Create a `Procfile` in the project root:
   ```
   web: node server/dist/server.js
   ```
3. Add Heroku's specific configuration (package.json):
   ```json
   "engines": {
     "node": "16.x"
   }
   ```
4. Add PostgreSQL addon:
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```
5. Deploy to Heroku:
   ```bash
   heroku create pasteshare-app
   git push heroku main
   ```
6. Set additional environment variables:
   ```bash
   heroku config:set NODE_ENV=production JWT_SECRET=your_secure_random_string
   ```

#### Render.com Deployment

1. Connect your Git repository
2. Set up a PostgreSQL database in Render
3. Configure as a Web Service
4. Set the build command: `npm run build`
5. Set the start command: `node server/dist/server.js`
6. Add environment variables in the Render dashboard:
   - `NODE_ENV=production`
   - `DATABASE_URL` (from your Render PostgreSQL service)
   - `JWT_SECRET=your_secure_random_string`

### Vercel Deployment

1. Connect your Git repository to Vercel
2. Set up a PostgreSQL database (Vercel Postgres, Supabase, or other provider)
3. Add the following environment variables in the Vercel project settings:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `NODE_ENV=production`
   - `JWT_SECRET=your_secure_random_string`
4. Deploy the project

## Additional Considerations

### Database Migration

When deploying with PostgreSQL, your database schema will be created automatically by Sequelize when the application first runs. For production environments, consider:

1. Creating database migration scripts for version control
2. Using Sequelize's migration tools for safe schema changes

### File Storage

For a scalable solution, consider:

1. Using cloud storage (AWS S3, Google Cloud Storage, etc.) instead of local file storage
2. Update the upload middleware in `server/src/middleware/upload.ts`

### HTTPS Configuration

Always use HTTPS in production. Either:
1. Configure SSL/TLS certificates with your reverse proxy
2. Use a service like Cloudflare for SSL termination
3. Use Let's Encrypt for free SSL certificates

### Backups

Set up regular backups of:
1. The database file or database contents
2. Uploaded files

## Troubleshooting

### Common Issues

1. **API Connection Errors**: Ensure the `REACT_APP_API_URL` is correctly set
2. **Upload Directory Issues**: Make sure the uploads directory exists and is writable
3. **Database Errors**: Check database connection and permissions
4. **CORS Issues**: Configure CORS headers properly if accessing across domains

### Logs

Check application logs for debugging:
- In PM2: `pm2 logs pasteshare`
- Docker logs: `docker-compose logs pasteshare`
- Heroku logs: `heroku logs --tail`

## Maintenance

- Regularly update dependencies
- Monitor server resources
- Implement a backup solution
- Set up monitoring and error tracking

# Deploying PasteShare to Vercel

This guide covers how to deploy PasteShare to Vercel, a cloud platform for static sites and serverless functions.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Vercel CLI installed (optional, for local testing)
   ```
   npm install -g vercel
   ```

## Environment Variables

Set up the following environment variables in your Vercel project settings:

### Frontend (Client) Variables
- `REACT_APP_API_URL`: URL to your API endpoint (e.g., `https://your-app-name.vercel.app/api`)

### Backend (Server) Variables
- `NODE_ENV`: Set to `production`
- `UPLOAD_DIR`: Set to `/tmp/uploads` (Vercel uses an ephemeral filesystem)
- `JWT_SECRET`: A strong secret key for JWT token generation
- `JWT_EXPIRES_IN`: JWT token expiration time (e.g., `7d`)

## Deployment Steps

1. **Connect your repository to Vercel**:
   - Go to [vercel.com](https://vercel.com) and create a new project
   - Connect to your GitHub/GitLab/Bitbucket repository
   - Vercel will detect your React application automatically

2. **Configure the project**:
   - Set the Framework Preset to "Create React App"
   - Set the Build Command to: `cd client && npm install && npm run build`
   - Set the Output Directory to: `client/build`

3. **Add environment variables**:
   - Go to the project settings and add all required environment variables

4. **Deploy**:
   - Click "Deploy" and Vercel will build and deploy your application

## Important Notes on Vercel Deployment

1. **File Storage**: Vercel has an ephemeral filesystem, meaning files uploaded to `/tmp/uploads` will not persist across function invocations. For production use, consider:
   - Using a cloud storage service like AWS S3, Google Cloud Storage, or Azure Blob Storage
   - Updating the upload middleware to work with cloud storage

2. **SQLite Database**: The SQLite database used in this application is also stored on the filesystem. For production, consider:
   - Using a managed database service compatible with Sequelize
   - Update the database configuration to connect to this service

3. **Serverless Functions**: Vercel has limitations for serverless functions:
   - Maximum execution duration (default 10 seconds)
   - Memory limits (1GB by default)
   - Cold starts can affect performance

## Alternative Deployment Options

If you encounter limitations with Vercel, consider:

1. **Railway**: Better support for persistent storage and databases
2. **Render**: Similar to Vercel but with better support for full-stack applications
3. **Heroku**: Traditional platform-as-a-service with persistent filesystem
4. **DigitalOcean App Platform**: Managed platform with persistent storage 