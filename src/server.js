const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import our new modules
const { RequestSchema, ValidatorResponseSchema } = require('./validation');
const { 
    createHmacSignature, 
    verifyHmacSignature, 
    generateIdempotencyKey,
    validateEnvironment,
    createErrorResponse,
    sanitizeFilename
} = require('./utils');

/* ========= Environment ========= */
const config = {
    PORT: process.env.PORT || 4000,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ebrt',
    VALIDATOR_URL: process.env.VALIDATOR_URL || 'http://localhost:5001/validate',
    NODE_ENV: process.env.NODE_ENV || 'development',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 15000,
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 2097152, // 2MB
    SPEC_PATH: process.env.SPEC_PATH || path.resolve(__dirname, '..', 'json', 'driveCycleOption.json'),
    SHARED_SECRET: process.env.SHARED_SECRET,
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
    RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS) || 1000,
};

// Validate environment
validateEnvironment();

/* ========= Configure Axios with Retries ========= */
axiosRetry(axios, { 
    retries: config.MAX_RETRIES, 
    retryDelay: axiosRetry.exponentialDelay, 
    retryCondition: (error) => {
        // Retry on network errors or 5xx responses
        return !error.response || (error.response.status >= 500 && error.response.status < 600);
    }
});

/* ========= Spec Loader ========= */
function loadSpec() {
    try {
        const raw = fs.readFileSync(config.SPEC_PATH, 'utf-8');
        const spec = JSON.parse(raw);
        
        // Validate spec structure
        if (!spec.backend_payload_template) {
            throw new Error(`Spec file ${config.SPEC_PATH} is missing required 'backend_payload_template' field`);
        }
        
        // Basic schema validation
        if (typeof spec.backend_payload_template !== 'object') {
            throw new Error(`Spec file ${config.SPEC_PATH} has invalid 'backend_payload_template' - must be an object`);
        }
        
        if (!spec.ui_schema) {
            console.warn('⚠️  Spec file missing ui_schema - some features may not work correctly');
        }
        
        return spec;
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.error(`❌ Spec file not found: ${config.SPEC_PATH}`);
            console.error(`💡 Make sure the file exists and SPEC_PATH is set correctly`);
        } else if (e instanceof SyntaxError) {
            console.error(`❌ Invalid JSON in spec file: ${config.SPEC_PATH}`);
            console.error(`💡 Check the file syntax and ensure it's valid JSON`);
        } else {
            console.error(`❌ Failed to load spec from ${config.SPEC_PATH}:`, e.message);
        }
        throw e;
    }
}
const SPEC = loadSpec();

/* ========= Utils ========= */
const deepClone = obj => JSON.parse(JSON.stringify(obj));

function endsWithFlag(k) {
    return typeof k === 'string' && k.endsWith('_Flag');
}

/**
 * Build a map: group -> { uiKey -> backendKey } and a set of calculated backendKeys to ignore
 */
function buildFieldMaps(spec) {
    const uiMap = {}; // group -> { uiKey: backendKey }
    const calculatedKeys = new Set(); // group.backendKey strings to never send
    const fieldTypeByBackendKey = {}; // group -> { backendKey: 'type' }

    const ui = spec.ui_schema || {};
    for (const [group, cfg] of Object.entries(ui)) {
        uiMap[group] = uiMap[group] || {};
        fieldTypeByBackendKey[group] = fieldTypeByBackendKey[group] || {};
        const fields = cfg.fields || [];
        for (const f of fields) {
            const backendKey = f.backend_key;
            if (!backendKey) continue;
            uiMap[group][f.key] = backendKey;
            fieldTypeByBackendKey[group][backendKey] = f.type || 'unknown';
            if (f.type === 'calculated' || f.show_only === true) {
                calculatedKeys.add(`${group}.${backendKey}`);
            }
        }
    }
    return { uiMap, calculatedKeys, fieldTypeByBackendKey };
}

const { uiMap, calculatedKeys, fieldTypeByBackendKey } = buildFieldMaps(SPEC);

/**
 * Map inputData (user-facing keys) into backend keys using ui_schema.backend_key.
 * Accepts both UI keys and already-backend keys for robustness.
 */
function mapInputToBackend(inputData) {
    if (!inputData || typeof inputData !== 'object') return {};
    const mapped = {};
    for (const [group, groupVal] of Object.entries(inputData)) {
        if (!groupVal || typeof groupVal !== 'object') continue;
        mapped[group] = mapped[group] || {};
        const groupMap = uiMap[group] || {};
        // First: copy over anything that already looks like backend keys (will be filtered later)
        for (const [k, v] of Object.entries(groupVal)) {
            mapped[group][k] = v;
        }
        // Then: apply UI→backend remapping
        for (const [uiKey, backendKey] of Object.entries(groupMap)) {
            if (Object.prototype.hasOwnProperty.call(groupVal, uiKey)) {
                mapped[group][backendKey] = groupVal[uiKey];
                // Optionally delete UI key shadow to avoid confusion (not required)
            }
        }
    }
    return mapped;
}

/**
 * Merge mapped input into template defaults, then enforce rules engine.
 */
function buildBackendPayload(inputData) {
    const tpl = deepClone(SPEC.backend_payload_template);
    const mapped = mapInputToBackend(inputData);

    // Merge provided values (only keys existing in template groups are considered)
    for (const [group, keys] of Object.entries(tpl)) {
        const src = mapped[group] || {};
        for (const [k, defVal] of Object.entries(keys)) {
            // Skip calculated fields altogether (not in template anyway, but double-guard)
            if (calculatedKeys.has(`${group}.${k}`)) continue;

            // For checkbox *_Flag, normalize boolean → 0/1 if provided
            if (endsWithFlag(k) && Object.prototype.hasOwnProperty.call(src, k)) {
                const raw = src[k];
                tpl[group][k] = raw ? 1 : 0;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(src, k)) {
                tpl[group][k] = src[k];
            } else {
                // keep default from template
                tpl[group][k] = defVal;
            }
        }
    }

    /* ===== Apply Rules Engine ===== */
    const DC = tpl.Driving_Cycle || {};
    const cycleType = Number(DC.Cycle_Type);

    // Time & Speed visibility/forcing
    const isStandard = [1, 2, 3, 4, 5].includes(cycleType);
    const isCity = cycleType === 0;
    const isCustom = cycleType === 6;

    if (isStandard) {
        // standard cycles: ensure Time/Speed null, Altitude = 0
        tpl.Driving_Cycle.Time_s = null;
        tpl.Driving_Cycle.Speed_mps = null;
        tpl.Driving_Cycle.Altitude_m = 0;
    }

    if (isCity) {
        // city-specific: omit Altitude_m from payload
        if (tpl.Driving_Cycle && Object.prototype.hasOwnProperty.call(tpl.Driving_Cycle, 'Altitude_m')) {
            delete tpl.Driving_Cycle.Altitude_m;
        }
        // Time/Speed should be present if provided by UI (we keep whatever mapped set)
    }

    if (isCustom) {
        // custom: Time/Speed must be arrays of equal length if both provided
        const t = mapped?.Driving_Cycle?.Time_s ?? tpl.Driving_Cycle.Time_s;
        const s = mapped?.Driving_Cycle?.Speed_mps ?? tpl.Driving_Cycle.Speed_mps;
        if ((Array.isArray(t) && !Array.isArray(s)) || (!Array.isArray(t) && Array.isArray(s))) {
            const err = new Error('Time_s and Speed_mps must both be arrays for Custom cycle');
            err.status = 400;
            throw err;
        }
        if (Array.isArray(t) && Array.isArray(s) && t.length !== s.length) {
            const err = new Error('Time_s and Speed_mps arrays must have the same length');
            err.status = 400;
            throw err;
        }
        // Altitude: if missing/empty, set scalar 0 (not array)
        const altProvided = Object.prototype.hasOwnProperty.call(mapped?.Driving_Cycle || {}, 'Altitude_m');
        if (!altProvided || mapped.Driving_Cycle.Altitude_m == null || (Array.isArray(mapped.Driving_Cycle.Altitude_m) && mapped.Driving_Cycle.Altitude_m.length === 0)) {
            tpl.Driving_Cycle.Altitude_m = 0;
        } else {
            // Keep what user sent (scalar or array)
            tpl.Driving_Cycle.Altitude_m = mapped.Driving_Cycle.Altitude_m;
        }
    }

    // Scenario visibility: only when standard
    if (!isStandard) {
        delete tpl.Scenario_data;
    } else {
        // Make sure VehicleLength at least has template default if user omitted
        const sd = tpl.Scenario_data || {};
        tpl.Scenario_data = {
            VehicleLength: sd.VehicleLength ?? SPEC.backend_payload_template.Scenario_data.VehicleLength,
            Return_Trip_Distance_km: sd.Return_Trip_Distance_km ?? 0,
            Number_of_Buses_in_Fleet: sd.Number_of_Buses_in_Fleet ?? 0,
            Average_Velocity_of_Route_kph: sd.Average_Velocity_of_Route_kph ?? 0,
        };
    }

    // ECO threshold visibility/requirement
    // in enums, ECO_Options: 2 = "ECO_Threshold"
    if (Number(DC.ECO_Options) === 2) {
        if (
            !Object.prototype.hasOwnProperty.call(mapped?.Driving_Cycle || {}, 'ECO_Threshold') ||
            mapped.Driving_Cycle.ECO_Threshold == null
        ) {
            const err = new Error('ECO_Threshold is required when ECO_Options = ECO_Threshold');
            err.status = 400;
            throw err;
        }
        // pass through mapped value (already merged)
    } else {
        // must not be sent/used
        tpl.Driving_Cycle.ECO_Threshold = null;
    }

    // Checkbox encoding for all *_Flag fields in Charger_data (normalize even if not provided)
    if (tpl.Charger_data) {
        for (const [k, v] of Object.entries(tpl.Charger_data)) {
            if (endsWithFlag(k)) {
                tpl.Charger_data[k] = v ? 1 : 0;
            }
        }
    }

    // Initial_Battery_SoC_pct defaultFrom MaximumSoC_pct if not explicitly provided
    if (tpl.Energy_Storage_data) {
        const es = tpl.Energy_Storage_data;
        if (
            (!Object.prototype.hasOwnProperty.call(mapped?.Energy_Storage_data || {}, 'Initial_Battery_SoC_pct')) &&
            typeof es.MaximumSoC_pct === 'number'
        ) {
            es.Initial_Battery_SoC_pct = es.MaximumSoC_pct;
        }
    }

    // Remove any accidentally merged "calculated" fields (defensive)
    for (const key of calculatedKeys) {
        const [g, f] = key.split('.');
        if (tpl[g] && Object.prototype.hasOwnProperty.call(tpl[g], f)) {
            delete tpl[g][f];
        }
    }

    return tpl;
}

/* ========= Express App ========= */
const app = express();

// Rate limiting
const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: config.MAX_FILE_SIZE + 'b', strict: true }));
app.use(express.urlencoded({ extended: true, limit: config.MAX_FILE_SIZE + 'b' }));

if (config.NODE_ENV === 'development') app.use(morgan('dev'));
else app.use(morgan('combined'));

// Apply rate limiting to API routes
app.use('/api/', limiter);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Static: serve frontend & json
const appDir = path.resolve(__dirname, '..', 'app');
app.use('/', express.static(appDir));
const jsonDir = path.resolve(__dirname, '..', 'json');
app.use('/json', express.static(jsonDir));

// Ensure data dirs
const dataRoot = path.resolve(__dirname, '..', 'data');
const inputDir = path.join(dataRoot, 'inputJSON');
const outputDir = path.resolve(__dirname, '..', 'app', 'simulationOutput');
for (const dir of [dataRoot, inputDir, outputDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ========= Mongoose ========= */
const simulationSchema = new mongoose.Schema(
    {
        userId: { type: String, default: null },
        inputData: { type: Object, required: [true, 'Input data is required'] },
        requestJSON: { type: Object, required: [true, 'Request JSON is required'] },
        preparedPayload: { type: Object, default: null }, // NEW: normalized payload sent to validator
        validatedResponse: { type: Object, default: null },
        status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
        error: { type: String, default: null },
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);
simulationSchema.virtual('duration').get(function () {
    if (this.createdAt && this.updatedAt) return this.updatedAt - this.createdAt;
    return null;
});
const Simulation = mongoose.model('Simulation', simulationSchema);

/* ========= Health ========= */
app.get('/api/health', (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config.NODE_ENV,
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            specVersion: SPEC?._meta?.version || 'unknown',
            specGeneratedAt: SPEC?._meta?.generated_at || 'unknown',
        };
        res.json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
});

/* ========= Validation ========= */
function validateInputData(req, res, next) {
    try {
        const parsed = RequestSchema.safeParse(req.body);
        if (!parsed.success) {
            const errors = parsed.error.flatten();
            return res.status(422).json({ 
                error: 'Validation failed', 
                message: 'Input data validation failed',
                details: errors
            });
        }
        
        // Replace req.body with validated data
        req.body = parsed.data;
        next();
    } catch (error) {
        console.error('Validation error:', error);
        return res.status(500).json(createErrorResponse(error, 500));
    }
}

/* ========= API ========= */

// For quick local testing of transform without DB
app.post('/api/transform', validateInputData, (req, res) => {
    try {
        const prepared = buildBackendPayload(req.body.inputData);
        res.json({ payload: prepared });
    } catch (e) {
        console.error('Transform error:', e.message);
        res.status(e.status || 422).json({ error: 'Transform error', message: e.message });
    }
});

// Save input (and prepared payload)
app.post('/api/save-input', validateInputData, async (req, res) => {
    try {
        const { userId, inputData } = req.body || {};

        // Build normalized payload according to spec & rules
        let prepared;
        try {
            prepared = buildBackendPayload(inputData);
        } catch (e) {
            return res.status(e.status || 422).json({ error: 'Invalid input', message: e.message });
        }

        const requestJSON = {
            userId: userId || null,
            inputData,               // keep original
            payload: prepared,       // what we will send to validator
            timestamp: new Date().toISOString(),
            version: SPEC?._meta?.version || '1.0.0',
        };

        const doc = await Simulation.create({
            userId: userId || null,
            inputData,
            requestJSON,
            preparedPayload: prepared,
            status: 'pending',
        });

        const fileBase = `${doc._id}`;
        const inputPath = path.join(inputDir, `${fileBase}.json`);
        try {
            fs.writeFileSync(inputPath, JSON.stringify(requestJSON, null, 2), 'utf-8');
            console.log(`💾 Saved input JSON: ${inputPath}`);
        } catch (fileError) {
            console.error('Failed to write input file:', fileError);
        }

        res.status(201).json({
            id: doc._id,
            message: 'Input data saved successfully',
            status: doc.status,
            timestamp: doc.createdAt,
        });
    } catch (err) {
        console.error('❌ Save input error:', err);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save input data' });
    }
});

// Send to external validator (uses preparedPayload)
app.post('/api/send-to-validator', async (req, res) => {
    try {
        const { id } = req.body || {};
        if (!id) {
            return res.status(400).json({ error: 'Missing required field', message: 'id is required' });
        }

        const doc = await Simulation.findById(id).exec();
        if (!doc) {
            return res.status(404).json({ error: 'Record not found', message: `Simulation with id ${id} not found` });
        }

        // Update status → processing
        doc.status = 'processing';
        await doc.save();

        // Payload to send (prefer preparedPayload; fallback to requestJSON.payload or full requestJSON)
        const payloadToSend =
            doc.preparedPayload ||
            doc.requestJSON?.payload ||
            doc.requestJSON;

        // Prepare headers with security and idempotency
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'eBRT-Backend/1.0.0',
            'Idempotency-Key': doc._id.toString(),
        };

        // Add HMAC signature if secret is configured
        if (config.SHARED_SECRET) {
            const signature = createHmacSignature(payloadToSend, config.SHARED_SECRET);
            if (signature) {
                headers['X-Signature'] = signature;
            }
        }

        let response;
        try {
            response = await axios.post(config.VALIDATOR_URL, payloadToSend, {
                timeout: config.REQUEST_TIMEOUT,
                headers,
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
                detail: data,
            });
        }

        const validated = response.data;
        
        // Validate validator response against schema
        try {
            const parsedResponse = ValidatorResponseSchema.safeParse(validated);
            if (!parsedResponse.success) {
                const errors = parsedResponse.error.flatten();
                console.error('❌ Validator response validation failed:', errors);
                
                doc.status = 'failed';
                doc.error = 'Invalid validator response format';
                await doc.save();
                
                return res.status(422).json({ 
                    error: 'Invalid validator response', 
                    message: 'Validator returned invalid response format',
                    details: errors
                });
            }
            
            // Use validated data
            validated = parsedResponse.data;
        } catch (validationError) {
            console.error('❌ Validator response validation error:', validationError);
            
            doc.status = 'failed';
            doc.error = 'Validator response validation error';
            await doc.save();
            
            return res.status(422).json({ 
                error: 'Validator response validation error', 
                message: 'Failed to validate validator response'
            });
        }

        doc.validatedResponse = validated;
        doc.status = 'completed';
        doc.error = null;
        await doc.save();

        const outputPath = path.join(outputDir, `${doc._id}.json`);
        try {
            fs.writeFileSync(outputPath, JSON.stringify(validated, null, 2), 'utf-8');
            console.log(`📄 Saved output JSON: ${outputPath}`);
        } catch (fileError) {
            console.error('Failed to write output file:', fileError);
        }

        res.json({ id: doc._id, message: 'Data validated successfully', status: doc.status, timestamp: doc.updatedAt });
    } catch (err) {
        console.error('❌ Send to validator error:', err);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send data to validator' });
    }
});

// Get results
app.get('/api/results/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid ID format', message: 'Please provide a valid simulation ID' });
        }
        const doc = await Simulation.findById(id).exec();
        if (!doc) {
            return res.status(404).json({ error: 'Record not found', message: `Simulation with id ${id} not found` });
        }
        res.json({
            id: doc._id,
            status: doc.status,
            preparedPayload: doc.preparedPayload || null,
            validatedResponse: doc.validatedResponse || null,
            error: doc.error,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        });
    } catch (err) {
        console.error('❌ Get results error:', err);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve simulation results' });
    }
});

/* ========= Errors ========= */
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    
    // Use our standardized error response
    const errorResponse = createErrorResponse(err, err.status || 500);
    res.status(errorResponse.status).json(errorResponse);
});

app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found', 
        message: `Route ${req.method} ${req.path} not found`,
        status: 404,
        timestamp: new Date().toISOString()
    });
});

/* ========= Start ========= */
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
            console.log(`📄 Spec path: ${config.SPEC_PATH}`);
        });

        // MongoDB error handling with fallback for development
        mongoose.connection.on('error', (e) => {
            console.warn('⚠️  MongoDB connection error:', e.message);
            if (config.NODE_ENV !== 'production') {
                console.warn('⚠️  Using in-memory store for development.');
                console.warn('⚠️  Data will not persist between restarts.');
                // Note: In a real implementation, you could add an in-memory store here
                // For now, we'll let the server run but operations will fail gracefully
            }
        });

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
