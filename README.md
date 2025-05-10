# PasteShare

PasteShare is a modern, Gruvbox-themed pastebin application designed for sharing code snippets, text, and files with others. It features a clean, intuitive interface with support for custom URLs, file attachments, and collaborative editing.

![image](https://github.com/user-attachments/assets/38b6f65a-e58d-4b9e-b79d-a5c505cc6b0b)

## Features

- **Clean, Modern UI** with Gruvbox light and dark themes
- **Code & Text Sharing** with syntax highlighting
- **File Attachments** - upload and share files alongside your pastes
- **Custom URLs** - create memorable links for easier sharing
- **Expiry Options** - set pastes to expire after a specific time
- **Private Pastes** - control who can access your content
- **Collaborative Editing** - allow others to edit your pastes
- **Mobile Responsive** - works great on all devices
- **Dynamic Port Detection** - automatically connects to available ports
- **Docker Support** - easily deploy with containerization

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Git
- PostgreSQL database
- Docker (optional, for containerized deployment)
- ImageMagick (optional, for icon generation)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/GarroNinja/PasteShare.git
   cd PasteShare
   ```

2. Set up PostgreSQL
   - Create a PostgreSQL database for PasteShare
   ```bash
   createdb pasteshare
   ```
   - Configure database connection by creating a `.env` file in the server directory based on `.env.example`
   ```bash
   cp server/.env.example server/.env
   ```
   - Edit the `.env` file with your database credentials

3. Install dependencies
   ```bash
   npm run install:all
   ```

4. Start the development servers
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:4000`

### Docker Installation

1. Build the Docker image
   ```bash
   docker build -t pasteshare .
   ```

2. Run the container with PostgreSQL
   ```bash
   docker run -p 4000:4000 -p 3000:3000 -e DATABASE_URL=postgres://username:password@host:port/pasteshare pasteshare
   ```

3. Access the application at `http://localhost:4000`

## Deployment

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

### Vercel Deployment

When deploying to Vercel, make sure to set up the following environment variables:
- `DATABASE_URL` - Your PostgreSQL connection string
- `NODE_ENV` - Set to `production`
- `JWT_SECRET` - A secure random string for JWT token generation

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL
- **ORM**: Sequelize
- **Containerization**: Docker
- **Development Tools**: 
  - Dynamic port allocation
  - SVG and PNG icon generation
  - Gruvbox theming (light and dark modes)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- Inspired by classic pastebin services with modern improvements
- Gruvbox color scheme by [morhetz](https://github.com/morhetz/gruvbox) 
