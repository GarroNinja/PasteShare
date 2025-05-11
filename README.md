# PasteShare

A modern pastebin application for sharing code snippets, text, and files.

## Screenshots
![image](https://github.com/user-attachments/assets/9429dc2c-6fe5-438d-a687-077f53aecc56) ![image](https://github.com/user-attachments/assets/9e7dbd5d-5d99-489f-aab7-df518ded2dec)

## Features

- Code & text sharing
- File attachments support
- Custom URLs for easier sharing
- Paste expiry options
- Private pastes
- Editable pastes
- Mobile responsive UI

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
- **Deployment**: Vercel Serverless Functions
