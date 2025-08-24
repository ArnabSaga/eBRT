const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Environment configuration with defaults
const config = {
    PORT: process.env.PORT || 4000,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ebrt',
    VALIDATOR_URL: process.env.VALIDATOR_URL || 'http://localhost:5001/validate',
    NODE_ENV: process.env.NODE_ENV || 'development',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 15000,
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 2097152 // 2MB
};

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'VALIDATOR_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingEnvVars.join(', ')}`);
    console.warn('Using default values. For production, set all required variables.');
}

const app = express();

// Security middleware
app.use(cors({
    origin: config.CORS_ORIGIN,
    credentials: true
}));

// Request parsing middleware
app.use(express.json({ 
    limit: config.MAX_FILE_SIZE + 'b',
    strict: true 
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: config.MAX_FILE_SIZE + 'b' 
}));

// Logging middleware
if (config.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Static: serve frontend from ./app
const appDir = path.resolve(__dirname, '..', 'app');
app.use('/', express.static(appDir));
// Serve JSON specifications
const jsonDir = path.resolve(__dirname, '..', 'json');
app.use('/json', express.static(jsonDir));

// Ensure data directories exist
const dataRoot = path.resolve(__dirname, '..', 'data');
const inputDir = path.join(dataRoot, 'inputJSON');
const outputDir = path.resolve(__dirname, '..', 'app', 'simulationOutput');

function ensureDirectories() {
    const directories = [dataRoot, inputDir, outputDir];
    directories.forEach((dir) => {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        } catch (error) {
            console.error(`❌ Failed to create directory ${dir}:`, error.message);
            process.exit(1);
        }
    });
}

ensureDirectories();

// Mongoose schema/model
const simulationSchema = new mongoose.Schema(
    {
        userId: { 
            type: String, 
            default: null 
        },
        inputData: { 
            type: Object, 
            required: [true, 'Input data is required'] 
        },
        requestJSON: { 
            type: Object, 
            required: [true, 'Request JSON is required'] 
        },
        validatedResponse: { 
            type: Object, 
            default: null 
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending'
        },
        error: {
            type: String,
            default: null
        }
    },
    { 
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Add virtual for duration
simulationSchema.virtual('duration').get(function() {
    if (this.createdAt && this.updatedAt) {
        return this.updatedAt - this.createdAt;
    }
    return null;
});

const Simulation = mongoose.model('Simulation', simulationSchema);

// Health check endpoint
app.get('/api/health', (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config.NODE_ENV,
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
        };
        res.json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Health check failed' 
        });
    }
});

// Input validation middleware
function validateInputData(req, res, next) {
    const { inputData } = req.body;
    
    if (!inputData || typeof inputData !== 'object') {
        return res.status(400).json({ 
            error: 'Invalid input data',
            message: 'inputData must be a valid object'
        });
    }
    
    // Additional validation can be added here
    next();
}

// POST /api/save-input - Save user input data
app.post('/api/save-input', validateInputData, async (req, res) => {
    try {
        const { userId, inputData } = req.body || {};

        const requestJSON = {
            userId: userId || null,
            inputData,
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };

        const doc = await Simulation.create({ 
            userId: userId || null, 
            inputData, 
            requestJSON,
            status: 'pending'
        });

        const fileBase = `${doc._id}`;
        const inputPath = path.join(inputDir, `${fileBase}.json`);
        
        try {
            fs.writeFileSync(inputPath, JSON.stringify(requestJSON, null, 2), 'utf-8');
            console.log(`💾 Saved input JSON: ${inputPath}`);
        } catch (fileError) {
            console.error('Failed to write input file:', fileError);
            // Don't fail the request if file write fails
        }

        res.status(201).json({ 
            id: doc._id, 
            message: 'Input data saved successfully',
            status: doc.status,
            timestamp: doc.createdAt
        });
    } catch (err) {
        console.error('❌ Save input error:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: 'Failed to save input data'
        });
    }
});

// POST /api/send-to-validator - Send data to external validator
app.post('/api/send-to-validator', async (req, res) => {
    try {
        const { id } = req.body || {};
        if (!id) {
            return res.status(400).json({ 
                error: 'Missing required field',
                message: 'id is required' 
            });
        }
        
        const doc = await Simulation.findById(id).exec();
        if (!doc) {
            return res.status(404).json({ 
                error: 'Record not found',
                message: `Simulation with id ${id} not found` 
            });
        }

        // Update status to processing
        doc.status = 'processing';
        await doc.save();

        // Send to external validator
        let response;
        try {
            response = await axios.post(config.VALIDATOR_URL, doc.requestJSON, { 
                timeout: config.REQUEST_TIMEOUT,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'eBRT-Backend/1.0.0'
                }
            });
        } catch (validatorErr) {
            console.error('❌ Validator request failed:', validatorErr.message);
            
            doc.status = 'failed';
            doc.error = validatorErr.message;
            await doc.save();
            
            const status = validatorErr.response?.status || 502;
            const data = validatorErr.response?.data || { error: 'Validator unreachable' };
            
            return res.status(status).json({ 
                error: 'Validator error', 
                message: validatorErr.message,
                detail: data 
            });
        }

        // Basic validation of response shape
        const validated = response.data;
        if (!validated || typeof validated !== 'object') {
            doc.status = 'failed';
            doc.error = 'Invalid validator response format';
            await doc.save();
            
            return res.status(422).json({ 
                error: 'Invalid validator response',
                message: 'Validator returned invalid response format'
            });
        }

        // Update document with validated response
        doc.validatedResponse = validated;
        doc.status = 'completed';
        doc.error = null;
        await doc.save();

        // Write to simulationOutput directory for frontend consumption
        const outputPath = path.join(outputDir, `${doc._id}.json`);
        
        try {
            fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2), 'utf-8');
            console.log(`📄 Saved output JSON: ${outputPath}`);
        } catch (fileError) {
            console.error('Failed to write output file:', fileError);
            // Don't fail the request if file write fails
        }

        res.json({ 
            id: doc._id, 
            message: 'Data validated successfully',
            status: doc.status,
            timestamp: doc.updatedAt
        });
    } catch (err) {
        console.error('❌ Send to validator error:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: 'Failed to send data to validator'
        });
    }
});

// GET /api/results/:id - Get simulation results
app.get('/api/results/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                error: 'Invalid ID format',
                message: 'Please provide a valid simulation ID' 
            });
        }
        
        const doc = await Simulation.findById(id).exec();
        if (!doc) {
            return res.status(404).json({ 
                error: 'Record not found',
                message: `Simulation with id ${id} not found` 
            });
        }
        
        res.json({ 
            id: doc._id, 
            status: doc.status,
            validatedResponse: doc.validatedResponse || null,
            error: doc.error,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        });
    } catch (err) {
        console.error('❌ Get results error:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: 'Failed to retrieve simulation results'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Connect to MongoDB and start server
async function start() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(config.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        console.log('✅ Connected to MongoDB successfully');
        
        const server = app.listen(config.PORT, () => {
            console.log(`🚀 Server running on http://localhost:${config.PORT}`);
            console.log(`📊 Environment: ${config.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${config.PORT}/api/health`);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('✅ Server closed');
                mongoose.connection.close(() => {
                    console.log('✅ Database connection closed');
                    process.exit(0);
                });
            });
        });
        
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}

start();


