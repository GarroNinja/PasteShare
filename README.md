# PasteShare

A modern pastebin application for sharing code snippets, text, and files.

## Screenshots
![Homepage Dark Mode](screenshots/homepage_dark.png)
![Paste Page Dark Mode](screenshots/pastepage_dark.png)

## Features

- Code & text sharing
- File attachments support
- Custom URLs for easier sharing
- Paste expiry options
- Unlisted pastes
- Password protection
- Editable pastes
- Jupyter-style notebook support with multiple code blocks
- Mobile responsive UI
- Syntax highlighting with multiple theme options
- Print-friendly view

## Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL database

### Local Development

1. Clone and set up:
   ```bash
   git clone https://github.com/YOUR_USERNAME/PasteShare.git
   cd PasteShare
   npm run install:all
   ```

2. Set up database:
   - Create a `.env` file in the server directory:
   ```
   DATABASE_URL=postgres://username:password@localhost:5432/pasteshare
   NODE_ENV=development
   ```

3. Start the application:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:4000`

## Deployment

### Docker Deployment

PasteShare can be containerized and deployed using Docker:

#### Server Deployment
```bash
# Navigate to server directory
cd server

# Build the Docker image
docker build -t pasteshare-server .

# Run the container
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://username:password@host:5432/pasteshare \
  -e NODE_ENV=production \
  pasteshare-server
```

#### Static Deployment
```bash
# Navigate to deploy directory
cd deploy

# Build the Docker image
docker build -t pasteshare-static .

# Run the container
docker run -p 8080:8080 pasteshare-static
```

### Google Cloud Platform (GCP)

Deployed site (until the trial period ends): https://pasteshare-knhsowbgzq-el.a.run.app/

1. Create a Cloud SQL PostgreSQL instance in GCP
2. Create an app.yaml file (gitignored) with the following configuration:
   ```yaml
   runtime: nodejs20
   service: default

   env_variables:
     NODE_ENV: "production"
     DATABASE_URL: "postgres://USERNAME:PASSWORD@/DATABASE_NAME?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME"

   handlers:
     # Serve API requests
     - url: /api/.*
       script: auto
       secure: always
     
     # Serve static files
     - url: /(.*\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot))
       static_files: client/build/\1
       upload: client/build/.*\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)
       secure: always

     # All other requests are routed to index.html
     - url: /.*
       static_files: client/build/index.html
       upload: client/build/index.html
       secure: always

   beta_settings:
     cloud_sql_instances: PROJECT_ID:REGION:INSTANCE_NAME

   automatic_scaling:
     max_instances: 2
     min_instances: 0
   ```

3. Build the client:
   ```bash
   cd client
   npm run build
   ```

4. Deploy to App Engine:
   ```bash
   gcloud app deploy
   ```

### Vercel

1. Fork this repository to your GitHub account
2. Create a new project in Vercel connected to your repository
3. Add environment variables:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `NODE_ENV`: `production`

For PostgreSQL, we recommend using a provider like:
- Supabase (with connection pooling enabled on port 6543)
- Neon
- Vercel Postgres

## Advanced Features

### Jupyter-Style Notebooks
PasteShare supports a Jupyter Notebook-like interface allowing users to create multi-block pastes with different languages. Each block can be independently:
- Written in a different programming language
- Individually copied with a dedicated copy button
- Edited separately when in edit mode
- Deleted (except for the first block which is required)

This makes PasteShare ideal for sharing multiple files easily, avoid having to create multiple pastes for the same purpose, or multi-language code demonstrations.

### Password Protection
PasteShare supports password protection for sensitive content. When creating a paste, you can enable password protection and set a password. Anyone trying to access the paste will need to enter the correct password to view its contents. This provides an additional layer of security beyond the unlisted paste option.

### Syntax Highlighting and Themes Support
PasteShare supports over 15 different languages for syntax highlighting with over 30 themes and automatic language detection. Users can manually select both language and theme for optimal code readability.

## Architecture

The application uses a serverless-optimized architecture:

- **Per-request database connections**: Each API request creates its own database connection, making it ideal for serverless environments where function instances are ephemeral.
- **Connection pooling**: When using Supabase, the app automatically uses connection pooling on port 6543.
- **Graceful fallbacks**: In development mode, the application can fall back to in-memory storage if the database is unavailable.
- **Case-insensitive lookups**: Custom URLs use case-insensitive matching for better user experience.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **ORM**: Sequelize
- **Syntax Highlighting**: react-syntax-highlighter
- **Deployment**: Vercel Serverless Functions, Google App Engine, Docker containers
