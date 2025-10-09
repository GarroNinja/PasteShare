# PasteShare

A clean pastebin alternative with Jupyter-style blocks and terminal access support.

## What's this?

I built this because I got tired of existing pastebin services which are either too bloated or are very minimal. It's fast, has asthetically pleasing UI, and supports multi-language blocks like Jupyter notebook. Plus it works great with curl for terminal users.

## Features

- **Multiple paste styles**: Regular text or Jupyter-style blocks
- **Terminal-friendly**: Raw endpoints for curl/wget 
- **File attachments**: Drag & drop support
- **Password protection**: Keep sensitive stuff private
- **Custom URLs**: Make links memorable
- **Syntax highlighting**: 30+ popular themes 
- **Expiration**: Auto-delete after time periods
- **Dark/light themes**: Because your eyes matter 

## Getting started

### Using Docker (for local deployment)

```bash
git clone https://github.com/yourusername/PasteShare.git
cd PasteShare
./setup-docker.sh
```

Visit http://localhost:4000 when it's done.

### Development mode

```bash
./setup-docker-dev.sh  # Enables hot-reload
```

### Deploy to Vercel

Works out of the box with Vercel. Just connect your repo and deploy.

You'll need a PostgreSQL database (Supabase works great).

## Terminal usage

Create a paste:
```bash
curl -X POST http://localhost:3000/api/pastes \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello world","title":"Test"}'
```

Get raw paste (termbin-style):
```bash
curl http://localhost:3000/api/pastes/raw/PASTE_ID
```

## Tech stack

- React + TypeScript frontend
- Express.js API server  
- PostgreSQL database
- Docker for easy deployment
- Tailwind CSS

## Configuration

Set these environment variables:

```bash
DATABASE_URL=your_postgres_url
FRONTEND_URL=http://localhost:4000
```

For Vercel deployment, add these in your dashboard.

## File structure

```
client/          React frontend
server/          Express API server  
api/             Vercel serverless functions
docker-compose.yml    Production setup
docker-compose.dev.yml    Development setup
```

## Contributing

Found a bug? Want a feature? Open an issue or send a PR. 


