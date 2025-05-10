# PasteShare

A modern pastebin application for sharing code snippets, text, and files.

## Screenshots
![image](https://github.com/user-attachments/assets/9429dc2c-6fe5-438d-a687-077f53aecc56) ![image](https://github.com/user-attachments/assets/9e7dbd5d-5d99-489f-aab7-df518ded2dec)

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

1. Create a Supabase PostgreSQL database
2. In Vercel, set the following environment variables:
   
   ```
   DATABASE_URL=postgres://postgres.[your-project-id]:[your-password]@aws-0-[region].pooler.supabase.co:6543/postgres
   NODE_ENV=production
   ```

3. **IMPORTANT**: Make sure to use the connection string format that includes the pooler:
   
   ```
   postgres://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.co:6543/postgres
   ```
   
   Not the standard connection string.

4. For local testing, create a `.env` file with:
   ```
   DATABASE_URL=postgres://postgres.[your-project-id]:[your-password]@aws-0-[region].pooler.supabase.co:6543/postgres
   NODE_ENV=development
   ```

5. Run the database verification script to test your connection:
   ```
   node db-verify.js
   ```

## Deployment Troubleshooting

If experiencing database connectivity issues:

1. Verify your Supabase connection string
2. Check that you're using the pooler version of the connection string 
3. Make sure your IP is allowlisted in Supabase
4. Confirm database permissions in Supabase
5. In Vercel, ensure environment variables are properly set

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **ORM**: Sequelize
