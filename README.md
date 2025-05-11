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
- Private pastes
- Editable pastes
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
- **Deployment**: Vercel Serverless Functions
