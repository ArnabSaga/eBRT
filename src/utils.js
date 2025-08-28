const crypto = require('crypto');

/**
 * Create HMAC signature for payload verification between backends
 */
function createHmacSignature(payload, secret) {
    if (!secret) {
        console.warn('No SHARED_SECRET provided, skipping HMAC signature');
        return null;
    }
    
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

/**
 * Verify HMAC signature from incoming requests
 */
function verifyHmacSignature(payload, signature, secret) {
    if (!secret || !signature) {
        console.warn('Missing secret or signature for HMAC verification');
        return false;
    }
    
    const expectedSignature = createHmacSignature(payload, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Generate a unique idempotency key
 */
function generateIdempotencyKey() {
    return crypto.randomUUID();
}

/**
 * Validate and sanitize environment variables
 */
function validateEnvironment() {
    const required = ['MONGODB_URI', 'VALIDATOR_URL'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
        console.warn('Using default values. For production, set all required variables.');
    }
    
    // Validate SHARED_SECRET for production
    if (process.env.NODE_ENV === 'production' && !process.env.SHARED_SECRET) {
        console.warn('⚠️  SHARED_SECRET not set in production. Backend communication will not be secured.');
    }
}

/**
 * Create standardized error response
 */
function createErrorResponse(error, status = 500) {
    return {
        error: error.name || 'Internal Server Error',
        message: error.message || 'Something went wrong',
        status,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    };
}

/**
 * Validate file size against limits
 */
function validateFileSize(size, maxSize) {
    return size <= maxSize;
}

/**
 * Sanitize filename for safe file operations
 */
function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = {
    createHmacSignature,
    verifyHmacSignature,
    generateIdempotencyKey,
    validateEnvironment,
    createErrorResponse,
    validateFileSize,
    sanitizeFilename,
};
