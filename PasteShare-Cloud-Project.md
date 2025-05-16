# PasteShare: Cloud-Native Code Sharing Application

## Project Overview

PasteShare is a modern code and text sharing application similar to Pastebin or GitHub Gists, built using cloud-native technologies. The application allows users to:

- Create text/code pastes with syntax highlighting
- Add file attachments to pastes
- Set custom URLs for easier sharing
- Configure paste expiry times
- Create private or public pastes
- Edit pastes (when enabled)
- Browse recently created public pastes

This document outlines the cloud architecture, development process, and deployment strategies used in the project.

## Architecture Diagram

```
[CLIENT]                 [SERVER]                  [DATABASE]
+-------------+         +---------------+         +-----------------+
|             |         |               |         |                 |
| React SPA   | ------> | Express.js    | ------> | PostgreSQL      |
| - TypeScript|         | - TypeScript  |         | - Paste data    |
| - TailwindCSS|        | - Sequelize   |         | - File storage  |
|             |         | - Multer      |         |                 |
+-------------+         +---------------+         +-----------------+
       |                        |                          |
       |                        |                          |
       v                        v                          v
+---------------------------------------------------------------------+
|                         CLOUD PLATFORM                               |
|                                                                     |
| [Initial: Vercel]                   [Current: Google Cloud Platform] |
| - Serverless Functions              - Cloud Run (Container)          |
| - Edge Network                      - Cloud SQL (PostgreSQL)         |
| - Vercel CLI                        - Cloud Build                    |
| - Environment Variables             - Secret Manager                 |
|                                                                     |
+---------------------------------------------------------------------+
```

## Cloud Services Used

### Initial Deployment: Vercel

1. **Vercel Serverless Functions**
   - Used for the backend API endpoints
   - Zero-configuration deployments
   - Automatic HTTPS and custom domain support

2. **Vercel Edge Network**
   - Global content delivery for static frontend assets
   - Low-latency API responses through edge caching

3. **Vercel CLI**
   - Local development and testing
   - CI/CD integration

4. **External Database**
   - Initially used Supabase PostgreSQL with connection pooling
   - Connection string stored in Vercel environment variables

### Current Production: Google Cloud Platform (GCP)

1. **Google Cloud Run**
   - Container-based deployment of the Express.js server
   - Auto-scaling based on demand
   - Only pay for what you use (serverless pricing model)

2. **Cloud SQL (PostgreSQL)**
   - Fully managed PostgreSQL database
   - Automatic backups and high availability
   - Secure connectivity via Unix sockets

3. **Cloud Build**
   - Automated container builds from source code
   - Integration with source repositories

4. **Secret Manager**
   - Secure storage of database credentials
   - Integration with Cloud Run for secure deployment

5. **Cloud SQL Proxy**
   - Secure local development with cloud database
   - Used during deployment initialization process

## Development Process

### Local Development Setup

1. **Environment Configuration**
   - `.env` files for local development
   - Connection to local PostgreSQL or Cloud SQL Proxy

2. **Database Schema Management**
   - Sequelize ORM for database schema definition
   - Model definitions for Pastes and Files
   - Database migration and seeding scripts

3. **Testing**
   - Local API testing with various database configurations
   - Testing of database fallback mechanisms

## Initial Deployment: Vercel

The project was initially deployed on Vercel, which offers an excellent developer experience for web applications with serverless backends.

### Vercel Deployment Configuration

The `vercel.json` configuration provided:

```json
{
  "version": 2,
  "buildCommand": "npm install pg pg-hstore sequelize react-syntax-highlighter && cd client && npm install && CI=false npm run build",
  "installCommand": "npm install pg pg-hstore",
  "outputDirectory": "client/build",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/server.js" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, DELETE, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "X-Requested-With, Content-Type, Accept, Authorization" },
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" }
      ]
    }
  ],
  "functions": {
    "api/server.js": {
      "memory": 1024,
      "maxDuration": 60
    }
  },
  "env": {
    "NODE_ENV": "production",
    "PG_CONNECTION_STRING_REQUIRED": "true",
    "POSTGRES_HOST": "from_database_url",
    "FORCE_DATABASE_URL": "true"
  }
}
```

### Vercel Deployment Process

1. **Setup**
   - Connect GitHub repository to Vercel project
   - Configure environment variables (DATABASE_URL)
   - Set up build commands

2. **Deployment**
   - Push to GitHub to trigger automatic deployment
   - Vercel builds and deploys the application
   - Provides a unique URL for the deployment

3. **Database Configuration**
   - Used Supabase PostgreSQL with connection pooling (port 6543)
   - Configured database connection in Vercel environment variables

### Challenges with Vercel Deployment

Despite Vercel's excellent developer experience, several challenges emerged:

1. **Cold Start Issues**
   - Serverless function cold starts caused delays in database connections
   - Required optimization of connection handling

2. **Statelessness Challenges**
   - Each function execution ran in isolation
   - Required careful design of database connection pool

3. **Database Connection Limitations**
   - Function execution timeouts limited long-running operations
   - Required optimized query patterns

4. **File Storage Constraints**
   - Serverless functions had limited storage capabilities
   - Led to implementing base64 encoding for file storage in the database

## Migration to Google Cloud Platform

To address the challenges faced with Vercel, the project was migrated to Google Cloud Platform, taking advantage of containerization and managed database services.

### Migration Process

1. **Database Migration**
   - Set up Cloud SQL PostgreSQL instance
   - Created database initialization scripts
   - Migrated schema and data from Supabase to Cloud SQL

2. **Application Containerization**
   - Created a Dockerfile for the application
   - Configured the container to serve both API and static content
   - Optimized for Cloud Run deployment

3. **Deployment Automation**
   - Created deployment scripts for initializing the database
   - Set up Cloud Build for container image creation
   - Configured Cloud Run service with appropriate settings

### Cloud Run Configuration

The application is deployed as a container to Cloud Run, with the following key configurations:

- Memory: 512 MB
- CPU: 1 CPU
- Concurrency: Default (80)
- Min instances: 0 (scale to zero when not in use)
- Max instances: 2 (limit costs while maintaining availability)
- Timeout: 300 seconds (increased from default for initialization)

### Database Configuration

Cloud SQL is configured with:

- PostgreSQL 14
- 1 vCPU, 1.7 GB RAM
- 10 GB SSD storage
- High availability: Disabled (to reduce costs)
- Backup: Enabled with daily backups
- Connection: Via Unix socket using Cloud SQL Auth Proxy

## Deployment Scripts

The deployment process is automated through the `fix-deploy-cloud-run.sh` script, which handles:

1. **Database Initialization**
   - Sets up Cloud SQL Proxy for local access
   - Initializes the database schema
   - Creates initial test data

2. **Application Building**
   - Builds the React frontend
   - Compiles the TypeScript backend
   - Prepares the deployment package

3. **Container Deployment**
   - Creates a container image using Cloud Build
   - Deploys the container to Cloud Run
   - Configures environment variables and secrets

```bash
# Cloud Run deployment command
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
```

## Key Technical Challenges and Solutions

### 1. Database Connection Handling

**Challenge**: In both Vercel and Cloud Run, establishing and maintaining database connections efficiently was challenging.

**Solution**:
- For Vercel: Optimized connection pooling settings and implemented a fallback mechanism
- For Cloud Run: Used Unix socket connections to Cloud SQL for improved performance and security
- Enhanced database.ts to handle both TCP and Unix socket connections dynamically

```typescript
// Determine connection type and configure appropriately
const isCloudSqlSocket = process.env.DATABASE_URL.includes('?host=/cloudsql/');
let dialectOptions = {};

if (isCloudSqlSocket) {
  console.log('Using Cloud SQL socket connection');
  const socketPath = process.env.DATABASE_URL.split('?host=')[1];
  
  dialectOptions = {
    socketPath: socketPath,
    ssl: false,
    connectTimeout: 30000,
    requestTimeout: 30000,
    keepAlive: true
  };
} else {
  dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  };
}
```

### 2. File Storage

**Challenge**: Storing and retrieving file attachments efficiently in a serverless environment.

**Solution**:
- Store files as base64-encoded strings in the PostgreSQL database
- Optimize file retrieval with appropriate caching headers
- Implement file size limits to prevent database overload

### 3. Container Startup Time

**Challenge**: Cloud Run containers had to initialize quickly to avoid timeout errors.

**Solution**:
- Optimized the application initialization process
- Increased the timeout setting for the Cloud Run service
- Implemented progressive database connection strategy

### 4. PORT Binding in Cloud Run

**Challenge**: Cloud Run assigns a dynamic port that the application must use.

**Solution**:
- Updated server.ts to listen on process.env.PORT when available
- Implemented fallback to port candidates for local development
- Added proper logging of port configuration

```typescript
// Prioritize PORT environment variable for Cloud Run
const PORT = process.env.PORT ? parseInt(process.env.PORT) : null;

// For Cloud Run, use the provided PORT
if (PORT) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (from environment)`);
  });
  return;
}
```

## Performance Comparison: Vercel vs. GCP

### Vercel

**Advantages**:
- Excellent developer experience
- Quick deployments
- Global edge network for static content
- Zero configuration for common patterns

**Challenges**:
- Cold start latency
- Function execution time limits
- Connection pooling complexity
- Limited customization

### Google Cloud Platform (Cloud Run)

**Advantages**:
- More consistent performance (reduced cold starts)
- Better long-running process support
- Direct database integration via Unix sockets
- More configurable compute resources
- Containerization allows for greater customization

**Challenges**:
- More complex setup and deployment
- Requires container knowledge
- Higher learning curve

## Monitoring and Logging

### Current Logging Solution

- Cloud Run logs accessible via Google Cloud Console
- Application-level logging with detailed connection information
- Database connection status tracking

### Future Enhancements

- Integration with Cloud Monitoring for alerts
- Setting up custom metrics for paste creation and access
- Implementing distributed tracing

## Conclusion

PasteShare demonstrates a complete cloud-native application lifecycle, from initial serverless deployment on Vercel to a more customized container-based deployment on Google Cloud Platform. The migration showcases important cloud computing concepts:

1. **Serverless vs. Container** tradeoffs and use cases
2. **Database connection management** in cloud environments
3. **Stateless application design** for horizontal scaling
4. **Deployment automation** with shell scripts and cloud build tools
5. **Environment-specific configuration** management
6. **Progressive enhancement** from development to production

This project serves as a practical example of cloud application deployment strategies and the considerations for choosing the right cloud services based on specific requirements and constraints.

## Future Work

1. **Implement CI/CD Pipeline** with GitHub Actions or Cloud Build triggers
2. **Add monitoring and alerting** for proactive issue detection
3. **Implement CDN caching** for static assets and common pastes
4. **Database scaling strategy** for handling increased load
5. **User authentication** for advanced use cases

---

## Appendix: Deployment Instructions

### Prerequisites

1. Google Cloud account with billing enabled
2. Google Cloud CLI (gcloud) installed
3. Cloud SQL instance created
4. Node.js and npm installed

### Deployment Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/PasteShare.git
   cd PasteShare
   ```

2. Run the deployment script:
   ```bash
   ./fix-deploy-cloud-run.sh
   ```

3. Follow the prompts to:
   - Enter your database password
   - Initialize the database (if needed)
   - Confirm deployment

4. Access the application at the provided URL after deployment 