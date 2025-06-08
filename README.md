# PasteShare

A modern, feature-rich pastebin application built with React and Node.js.

## Screenshots
![Homepage Dark Mode](screenshots/homepage_dark.png)
![Paste Page Dark Mode](screenshots/pastepage_dark.png)

## Features

### 📝 **Paste Management**
- Create and share text pastes with syntax highlighting
- Support for 20+ programming languages
- Custom URLs for easy sharing
- Expiration dates (5 minutes to never)
- Private/unlisted pastes
- Password protection
- Editable pastes

### 🔧 **Advanced Features**
- **Jupyter Notebook Style**: Create multi-block pastes with different languages per block
- **File Attachments**: Upload up to 3 files (10MB each) per paste
- **📋 Clipboard Image Pasting**: Paste images directly with Ctrl+V - no need to save screenshots first!
- **Pagination**: Browse recent pastes with 5 per page
- **Auto-cleanup**: Expired pastes are automatically removed from database
- **Password Protection**: Secure your pastes with passwords

### 🎨 **User Experience**
- Dark/Light theme support
- Responsive design for mobile and desktop
- Multiple syntax highlighting themes
- Copy to clipboard functionality
- Print support
- Real-time paste preview

### 🔒 **Security & Privacy**
- Password-protected pastes with bcrypt encryption
- Content hidden in recent pastes for password-protected items
- Automatic cleanup of expired content
- No tracking or analytics

## Quick Start

1. Visit [PasteShare](https://www.pasteshare.ninja)
2. Paste your content or create Jupyter-style blocks
3. **New!** Copy an image to clipboard and paste with Ctrl+V to attach it instantly
4. Configure expiration, privacy, and other settings
5. Share the generated URL

## Clipboard Image Pasting

The new clipboard image pasting feature allows you to:
- Copy any image (screenshot, image from web, etc.)
- Paste directly into the form with **Ctrl+V**
- Automatically generates timestamped filenames
- Supports all common image formats (PNG, JPG, GIF, etc.)
- Respects file size limits (10MB) and count limits (3 files)
- Shows real-time feedback during processing

Perfect for quickly sharing screenshots, diagrams, or any visual content without the hassle of saving files first!

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Sequelize ORM
- **Deployment**: Vercel
- **File Storage**: Local filesystem with base64 encoding

## Development

```bash
# Clone the repository
git clone https://github.com/GarroNinja/PasteShare.git
cd PasteShare

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## API Endpoints

- `GET /api/pastes/recent?page=1` - Get recent pastes with pagination
- `POST /api/pastes` - Create new paste
- `GET /api/pastes/:id` - Get paste by ID
- `PUT /api/pastes/:id` - Update paste (if editable)
- `POST /api/pastes/:id/verify-password` - Verify paste password
- `GET /api/pastes/cleanup` - Clean up expired pastes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

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
