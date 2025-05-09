import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';
import { sequelize } from './models';
import routes from './routes';
import fs from 'fs';
import net from 'net';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT_CANDIDATES = [3000, 3001, 3003, 3004, 3005, 3006, 3007, 3008]; // Try more ports

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:4000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
  maxAge: 86400 // 24 hours
};

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Middleware - apply CORS before other middleware
app.use(cors(corsOptions));

// Configure JSON and URL-encoded middleware with appropriate limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Static files for uploads - make this directory accessible from the browser
// Use absolute path to ensure files are found in all environments
const uploadPath = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

console.log(`Setting up static file serving for uploads at: ${uploadPath}`);
app.use('/uploads', express.static(uploadPath));

// API routes
app.use('/api', routes);

// Add route debugging
app.use((req, res, next) => {
  console.log(`DEBUG - Unhandled route: ${req.method} ${req.originalUrl}`);
  next();
});

// Health check route
app.get('/health', (req, res) => {
  console.log('Health check request received');
  res.status(200).json({ 
    status: 'UP', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'unknown',
    host: req.headers.host,
    env: process.env.NODE_ENV || 'development'
  });
});

// Handle 404
app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: 'Route not found' });
});

// Function to check if a port is available
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false);
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
};

// Connect to database and start server
const startServer = async () => {
  try {
    // Sync database models
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Sync models with database with altering to add new fields
    await sequelize.sync({ alter: true });
    
    // Try to find an available port from candidates
    let selectedPort = 0;
    
    for (const port of PORT_CANDIDATES) {
      const available = await isPortAvailable(port);
      if (available) {
        selectedPort = port;
        break;
      }
    }
    
    if (selectedPort === 0) {
      console.log('No available ports found in the candidate list. Using random port.');
      // Use a random port as last resort
      const server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          selectedPort = address.port;
          console.log(`Server running on random port ${selectedPort}`);
          // Write the port to a file so other processes can find it
          fs.writeFileSync('server-port.txt', `${selectedPort}`);
        }
      });
    } else {
      // Start on the selected port
      app.listen(selectedPort, () => {
        console.log(`Server running on port ${selectedPort}`);
        // Write the port to a file so other processes can find it
        fs.writeFileSync('server-port.txt', `${selectedPort}`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 