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
const PORT_CANDIDATES = [3003, 3004, 3005, 3006, 3007, 3008]; // Avoid 3001/3002 completely

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:4000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files for uploads - make this directory accessible from the browser
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api', routes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', message: 'Server is running' });
});

// Handle 404
app.use((req, res) => {
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
    
    // Sync models with database
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    
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
          fs.writeFileSync('server-port.txt', selectedPort.toString());
        }
      });
    } else {
      // Start on the selected port
      app.listen(selectedPort, () => {
        console.log(`Server running on port ${selectedPort}`);
        // Write the port to a file so other processes can find it
        fs.writeFileSync('server-port.txt', selectedPort.toString());
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 