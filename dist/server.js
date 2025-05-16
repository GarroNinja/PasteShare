"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const models_1 = require("./models");
const routes_1 = __importDefault(require("./routes"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
// Load environment variables
dotenv_1.default.config();
// Initialize Express app
const app = (0, express_1.default)();
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
app.use((0, cors_1.default)(corsOptions));
// Configure JSON and URL-encoded middleware with appropriate limits
app.use(express_1.default.json({ limit: '11mb' })); // Increased to handle 10MB uploads plus overhead
app.use(express_1.default.urlencoded({ extended: true, limit: '11mb' }));
app.use((0, morgan_1.default)('dev'));
// Static files for uploads - make this directory accessible from the browser
// Use absolute path to ensure files are found in all environments
const uploadPath = process.env.UPLOAD_DIR
    ? path_1.default.resolve(process.env.UPLOAD_DIR)
    : path_1.default.resolve(process.cwd(), 'uploads');
console.log(`Setting up static file serving for uploads at: ${uploadPath}`);
app.use('/uploads', express_1.default.static(uploadPath));
// API routes
app.use('/api', routes_1.default);
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
    }
    catch (error) {
        console.error('Root paste handler error:', error);
        next(error);
    }
});
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
const isPortAvailable = (port) => {
    return new Promise((resolve) => {
        const server = net_1.default.createServer();
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
        await models_1.sequelize.authenticate();
        console.log('Database connection established successfully.');
        // Sync models with database with altering to add new fields if needed
        await models_1.sequelize.sync({ alter: process.env.NODE_ENV === "development" });
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
                    fs_1.default.writeFileSync('server-port.txt', `${selectedPort}`);
                }
            });
        }
        else {
            // Start on the selected port
            app.listen(selectedPort, () => {
                console.log(`Server running on port ${selectedPort}`);
                // Write the port to a file so other processes can find it
                fs_1.default.writeFileSync('server-port.txt', `${selectedPort}`);
            });
        }
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
