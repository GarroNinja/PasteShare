// Static server wrapper for Cloud Run deployment
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');

// Import the sequelize instance and routes
const { sequelize } = require('./models');
const routes = require('./routes').default;

// Create express app
const app = express();

// Get port from environment or use 8080 as fallback
const PORT = process.env.PORT || 8080;

// Log environment variables for debugging
console.log('Starting PasteShare server with environment:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins in production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
  maxAge: 86400 // 24 hours
};

// Configure middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '11mb' }));
app.use(express.urlencoded({ extended: true, limit: '11mb' }));
app.use(morgan('dev'));

// Set up the uploads directory
const uploadPath = process.env.UPLOAD_DIR 
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');
console.log(`Setting up static file serving for uploads at: ${uploadPath}`);
app.use('/uploads', express.static(uploadPath));

// API routes
app.use('/api', routes);

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, '../public')));

// Add root-level paste handling
app.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Skip this handler for known frontend routes
    if (id === 'recent' || id === 'health' || id.includes('.') || id === 'api') {
      return next();
    }
    
    console.log(`Handling paste at root level: ${id}`);
    
    // Forward to the pastes/:id handler
    req.url = `/api/pastes/${id}`;
    app._router.handle(req, res);
  } catch (error) {
    console.error('Root paste handler error:', error);
    next(error);
  }
});

// Health check route (important for Cloud Run)
app.get('/health', (req, res) => {
  console.log('Health check request received');
  res.status(200).json({ 
    status: 'UP', 
    message: 'Server running on Cloud Run',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'production'
  });
});

// For any other routes, serve the index.html file (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Handle 404 for API routes that didn't match
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }
});

// Start the server
const startServer = async () => {
  try {
    // Connect to database
    console.log('Attempting to connect to database...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Sync models with database (don't use alter in production)
    await sequelize.sync({ alter: false });
    
    // Start server on the specified PORT
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server with database:', error);
    // Don't exit in production - try to serve static content even if DB fails
    console.log('Continuing to serve static content despite database error');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (DB connection failed)`);
    });
  }
};

// Start the server
startServer();
