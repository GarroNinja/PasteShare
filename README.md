# PasteShare

A modern pastebin application for sharing code snippets, text, and files.
![image](https://github.com/user-attachments/assets/38b6f65a-e58d-4b9e-b79d-a5c505cc6b0b)

## Features

- Code & text sharing with syntax highlighting
- File attachments support
- Custom URLs for easier sharing
- Paste expiry options
- Private pastes
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

For PostgreSQL, use a provider like:
- Supabase
- Neon
- Vercel Postgres

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **ORM**: Sequelize
