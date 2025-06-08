import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import net from 'net';

// Load environment variables
dotenv.config();

// Import the working API routes from the JavaScript version
const pasteRoutes = require('../../api/pasteRoutes');

// Extend Express Request interface to include db property
declare global {
  namespace Express {
    interface Request {
      db?: any;
    }
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : null;
const PORT_CANDIDATES = [3000, 3001, 3003, 3004, 3005, 3006, 3007, 3008];

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:4000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
  maxAge: 86400
};

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '11mb' }));
app.use(express.urlencoded({ extended: true, limit: '11mb' }));
app.use(morgan('dev'));

// Static files for uploads
const uploadPath = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

console.log(`Setting up static file serving for uploads at: ${uploadPath}`);
app.use('/uploads', express.static(uploadPath));

// Add database connection middleware (from the working API)
app.use((req, res, next) => {
  try {
    if (!pasteRoutes.createConnection) {
      console.error('Database middleware error: createConnection function not available');
      res.setHeader('X-DB-Status', 'middleware-error');
      next();
      return;
    }
    
    req.db = pasteRoutes.createConnection();
    
    if (req.db && req.db.success) {
      console.log(`Database connection established`);
      res.setHeader('X-DB-Status', 'connected');
    } else {
      console.error(`Database connection failed:`, req.db?.error || 'Unknown error');
      res.setHeader('X-DB-Status', 'failed');
    }
    
    next();
  } catch (error) {
    console.error(`Error in database middleware:`, error);
    res.setHeader('X-DB-Status', 'error');
    next();
  }
});

// API routes - use the working JavaScript routes
app.use('/api/pastes', pasteRoutes);

// Add root-level paste handling
app.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (id === 'recent' || id === 'health' || id.includes('.') || id === 'api') {
      return next();
    }
    
    console.log(`Handling paste at root level: ${id}`);
    req.url = `/api/pastes/${id}`;
    app._router.handle(req, res);
  } catch (error) {
    console.error('Root paste handler error:', error);
    next(error);
  }
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
    env: process.env.NODE_ENV || 'development',
    port: PORT || 'using dynamic port'
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

// Start server
const startServer = async () => {
  try {
    console.log('Starting PasteShare server...');
    
    // If PORT is defined in environment, use that port
    if (PORT) {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} (from environment)`);
      });
      return;
    }
    
    // For local development, find an available port
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
      const server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          selectedPort = address.port;
          console.log(`Server running on random port ${selectedPort}`);
          fs.writeFileSync('server-port.txt', `${selectedPort}`);
        }
      });
    } else {
      app.listen(selectedPort, () => {
        console.log(`Server running on port ${selectedPort}`);
        fs.writeFileSync('server-port.txt', `${selectedPort}`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 