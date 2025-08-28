const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.VALIDATOR_PORT || 5001;
const SHARED_SECRET = process.env.SHARED_SECRET || 'your-super-secret-key-here';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// HMAC verification middleware
function verifySignature(req, res, next) {
    const signature = req.headers['x-signature'];
    const idempotencyKey = req.headers['idempotency-key'];
    
    if (!signature && SHARED_SECRET) {
        return res.status(401).json({ 
            error: 'Missing signature',
            message: 'HMAC signature required for security'
        });
    }
    
    if (signature && SHARED_SECRET) {
        const expectedSignature = crypto
            .createHmac('sha256', SHARED_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');
            
        if (!crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        )) {
            return res.status(401).json({ 
                error: 'Invalid signature',
                message: 'HMAC signature verification failed'
            });
        }
    }
    
    // Store idempotency key for deduplication
    req.idempotencyKey = idempotencyKey;
    next();
}

// Simple in-memory storage for idempotency (use Redis in production)
const processedRequests = new Map();

// Validate endpoint
app.post('/validate', verifySignature, async (req, res) => {
    try {
        const { idempotencyKey } = req;
        
        // Check idempotency
        if (idempotencyKey && processedRequests.has(idempotencyKey)) {
            const cached = processedRequests.get(idempotencyKey);
            return res.json(cached);
        }
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Extract driving cycle data
        const drivingCycle = req.body.Driving_Cycle || {};
        const cycleType = drivingCycle.Cycle_Type || 0;
        
        // Generate sample timeseries data based on cycle type
        const timeSteps = 100;
        const time_s = Array.from({ length: timeSteps }, (_, i) => i);
        
        let speed_ms = [];
        let rpm = [];
        let fuel_lph = [];
        let load_pct = [];
        let torque_pct = [];
        
        // Generate realistic data based on cycle type
        if (cycleType === 0) { // City
            speed_ms = time_s.map(t => Math.max(0, 15 + 10 * Math.sin(t / 10) + 5 * Math.random()));
            rpm = time_s.map(t => 800 + 200 * Math.sin(t / 15) + 50 * Math.random());
        } else if (cycleType === 6) { // Custom
            speed_ms = drivingCycle.Speed_mps || time_s.map(t => 20 + 15 * Math.sin(t / 20));
            rpm = time_s.map(t => 900 + 300 * Math.sin(t / 25) + 100 * Math.random());
        } else { // Standard cycles
            speed_ms = time_s.map(t => 25 + 20 * Math.sin(t / 12) + 8 * Math.random());
            rpm = time_s.map(t => 1000 + 400 * Math.sin(t / 18) + 150 * Math.random());
        }
        
        // Generate correlated metrics
        fuel_lph = time_s.map((_, i) => 2.0 + 0.5 * (speed_ms[i] / 50) + 0.1 * Math.random());
        load_pct = time_s.map((_, i) => 15 + 25 * (speed_ms[i] / 50) + 5 * Math.random());
        torque_pct = time_s.map((_, i) => 12 + 20 * (speed_ms[i] / 50) + 3 * Math.random());
        
        // Calculate final metrics
        const finalSpeed = speed_ms[speed_ms.length - 1];
        const finalRpm = rpm[rpm.length - 1];
        const avgFuel = fuel_lph.reduce((a, b) => a + b, 0) / fuel_lph.length;
        const distance = time_s.reduce((acc, t, i) => {
            if (i === 0) return 0;
            const dt = time_s[i] - time_s[i-1];
            const avgSpeed = (speed_ms[i] + speed_ms[i-1]) / 2;
            return acc + (avgSpeed * dt / 1000); // Convert to km
        }, 0);
        
        const response = {
            version: "1.0.0",
            computed_at: new Date().toISOString(),
            timeseries: {
                time_s,
                speed_ms,
                rpm,
                fuel_lph,
                load_pct,
                torque_pct
            },
            metrics: {
                fuel_rate_lph: parseFloat(avgFuel.toFixed(1)),
                fuel_pct: Math.round(avgFuel * 15), // Rough percentage
                load_pct: Math.round(load_pct[load_pct.length - 1]),
                torque_pct: Math.round(torque_pct[torque_pct.length - 1]),
                dtc_count: 0,
                coolant_c: 75 + 5 * Math.random(),
                intake_c: 25 + 8 * Math.random(),
                ambient_c: 20 + 5 * Math.random(),
                distance_km: parseFloat(distance.toFixed(1)),
                speed_now: parseFloat(finalSpeed.toFixed(1)),
                rpm_now: Math.round(finalRpm)
            }
        };
        
        // Cache for idempotency
        if (idempotencyKey) {
            processedRequests.set(idempotencyKey, response);
            // Clean up old entries (simple LRU)
            if (processedRequests.size > 1000) {
                const firstKey = processedRequests.keys().next().value;
                processedRequests.delete(firstKey);
            }
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            error: 'Validation failed',
            message: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Validator server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 HMAC verification: ${SHARED_SECRET ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});
