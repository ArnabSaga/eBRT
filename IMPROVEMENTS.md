# eBRT Simulation System Improvements

This document outlines the comprehensive improvements made to the eBRT simulation system based on the requirements analysis.

## 🚀 Overview of Improvements

The system has been enhanced with:
- **Input Validation**: Strict JSON schema validation using Zod
- **Security**: HMAC signing between backends
- **Reliability**: Automatic retries with exponential backoff
- **Rate Limiting**: Protection against abuse
- **Error Handling**: Standardized error responses
- **Idempotency**: Prevents duplicate processing
- **Direct Flow**: Simplified user experience

## 📁 New Files Added

### 1. `src/validation.js`
- **Purpose**: Input and output validation schemas
- **Features**: 
  - Zod-based validation for all input data
  - Strict typing for driving cycles, scenarios, and components
  - Validator response validation
  - Flexible schema that allows additional fields

### 2. `src/utils.js`
- **Purpose**: Utility functions for security and operations
- **Features**:
  - HMAC signature creation and verification
  - Idempotency key generation
  - Environment validation
  - Standardized error responses
  - File safety utilities

### 3. `validator-example.js`
- **Purpose**: Example validator backend implementation
- **Features**:
  - Demonstrates expected contract
  - HMAC signature verification
  - Idempotency handling
  - Realistic data generation
  - Health check endpoint

## 🔧 Enhanced Server (`src/server.js`)

### Input Validation
```javascript
// Before: Basic validation
function validateInputData(req, res, next) {
    const { inputData } = req.body;
    if (!inputData || typeof inputData !== 'object') {
        return res.status(400).json({ error: 'Invalid input data' });
    }
    // ... basic checks
}

// After: Zod schema validation
function validateInputData(req, res, next) {
    try {
        const parsed = RequestSchema.safeParse(req.body);
        if (!parsed.success) {
            const errors = parsed.error.flatten();
            return res.status(422).json({ 
                error: 'Validation failed', 
                details: errors
            });
        }
        req.body = parsed.data;
        next();
    } catch (error) {
        return res.status(500).json(createErrorResponse(error, 500));
    }
}
```

### Security Headers
```javascript
// HMAC signing for backend communication
const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'eBRT-Backend/1.0.0',
    'Idempotency-Key': doc._id.toString(),
};

if (config.SHARED_SECRET) {
    const signature = createHmacSignature(payloadToSend, config.SHARED_SECRET);
    if (signature) {
        headers['X-Signature'] = signature;
    }
}
```

### Automatic Retries
```javascript
// Configure axios with retries
axiosRetry(axios, { 
    retries: config.MAX_RETRIES, 
    retryDelay: axiosRetry.exponentialDelay, 
    retryCondition: (error) => {
        return !error.response || (error.response.status >= 500 && error.response.status < 600);
    }
});
```

### Rate Limiting
```javascript
const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
    }
});

app.use('/api/', limiter);
```

## 🔐 Security Features

### HMAC Signing
- **Purpose**: Verify communication between producer and validator backends
- **Implementation**: SHA-256 HMAC with configurable secret
- **Headers**: `X-Signature` for payload verification
- **Fallback**: Graceful degradation if secret not configured

### Idempotency
- **Purpose**: Prevent duplicate processing of requests
- **Implementation**: Unique key per request stored in `Idempotency-Key` header
- **Benefits**: Safe retries, prevents double-charging

### Rate Limiting
- **Purpose**: Protect against abuse and DoS attacks
- **Configuration**: Configurable via environment variables
- **Default**: 100 requests per 15 minutes
- **Headers**: Standard rate limit headers included

## 📊 Data Flow Improvements

### Before (Complex Flow)
```
Parameter Form → Save Input → Simulation Interface → Poll Results → Output Page
```

### After (Simplified Flow)
```
Parameter Form → Save Input → Direct to Output Page (with polling)
```

### Benefits
- **Faster UX**: Users see results immediately
- **Simpler Code**: Fewer page transitions
- **Better Error Handling**: Centralized error management
- **Progress Tracking**: Built-in status monitoring

## 🔄 Retry Logic

### Configuration
```bash
MAX_RETRIES=3
RETRY_DELAY_MS=1000
REQUEST_TIMEOUT=15000
```

### Retry Conditions
- Network errors (no response)
- 5xx server errors
- Configurable retry count
- Exponential backoff delay

### Example
```javascript
// Request fails with 500 error
// Retry 1: After 1 second
// Retry 2: After 2 seconds  
// Retry 3: After 4 seconds
// Final failure: Return error to user
```

## 📝 Environment Variables

### New Variables Added
```bash
# Security
SHARED_SECRET=your-super-secret-key-here

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY_MS=1000
```

### Updated Variables
```bash
# Enhanced validation
SPEC_PATH=./json/spec.json

# Security timeout
REQUEST_TIMEOUT=15000
```

## 🚀 Quick Setup Guide

### Prerequisites
- Node.js 16+ and npm
- MongoDB (optional for development, required for production)
- Two available ports: 4000 and 5001

### Environment Setup
1. Copy `env.example` to `.env`
2. Update `SHARED_SECRET` with a strong random string
3. Ensure `SPEC_PATH` points to `./json/driveCycleOption.json`
4. Set `VALIDATOR_URL=http://localhost:5001/validate`

### Service Startup Order
1. **Start MongoDB** (if using): `mongod`
2. **Start Producer Backend**: `npm start` (port 4000)
3. **Start Validator**: `node validator-example.js` (port 5001)

## 🧪 Testing the Improvements

### 1. Start the Main Backend
```bash
cd /d/job/final
npm start
```
**Port**: 4000 (http://localhost:4000)

### 2. Start the Example Validator
```bash
# In a new terminal
cd /d/job/final
node validator-example.js
```
**Port**: 5001 (http://localhost:5001)

**Important**: Both services must be running for the complete flow to work!

### 3. Test the Flow
1. Open `http://localhost:4000/parameter.html`
2. Fill out the form and click "RUN SIMULATION"
3. You'll be redirected to the output page
4. The system will automatically fetch and display results

### 4. Test Security Features
```bash
# Test without HMAC (should work)
curl -X POST http://localhost:4000/api/save-input \
  -H "Content-Type: application/json" \
  -d '{"userId": null, "inputData": {"Driving_Cycle": {"Cycle_Type": 1}}}'

# Test with invalid HMAC (should fail if SHARED_SECRET is set)
curl -X POST http://localhost:5001/validate \
  -H "Content-Type: application/json" \
  -H "X-Signature: invalid-signature" \
  -d '{"Driving_Cycle": {"Cycle_Type": 1}}'
```

### 5. Service Dependencies
- **Producer Backend**: Must be running on port 4000
- **Validator/Analyzer**: Must be running on port 5001 (or update VALIDATOR_URL)
- **MongoDB**: Required for production, optional for development (with warnings)
- **SHARED_SECRET**: Must be identical in both services for HMAC verification

## 🚨 Error Handling

### Standardized Error Format
```json
{
  "error": "Validation failed",
  "message": "Input data validation failed",
  "status": 422,
  "timestamp": "2025-01-28T10:30:00.000Z",
  "details": {
    "fieldErrors": {},
    "formErrors": ["Driving_Cycle.Cycle_Type is required"]
  }
}
```

### Error Categories
- **400**: Bad Request (malformed data)
- **422**: Validation Error (schema violations)
- **429**: Rate Limit Exceeded
- **500**: Internal Server Error
- **502**: Bad Gateway (validator errors)

## 📈 Performance Improvements

### Before
- Basic error handling
- No retries on failures
- Simple validation
- Manual progress tracking

### After
- Comprehensive error handling
- Automatic retries with backoff
- Strict input validation
- Built-in progress monitoring
- Rate limiting protection

## 🔮 Future Enhancements

### 1. WebSocket Support
- Real-time progress updates
- Live data streaming
- Push notifications

### 2. Advanced Caching
- Redis for idempotency
- Response caching
- Distributed rate limiting

### 3. Monitoring & Observability
- Request tracing
- Performance metrics
- Error tracking
- Health dashboards

### 4. Authentication & Authorization
- JWT tokens
- Role-based access
- API key management

## 📚 API Reference

### POST `/api/save-input`
- **Purpose**: Save simulation input and prepare payload
- **Validation**: Strict Zod schema validation
- **Response**: `{ id, message, status, timestamp }`
- **Rate Limit**: Applied

### POST `/api/send-to-validator`
- **Purpose**: Send prepared payload to external validator
- **Security**: HMAC signature verification
- **Retries**: Automatic with exponential backoff
- **Response**: `{ id, message, status, timestamp }`

### GET `/api/results/:id`
- **Purpose**: Retrieve simulation results
- **Response**: Complete simulation data with status
- **Caching**: Results cached in MongoDB

### GET `/api/health`
- **Purpose**: System health check
- **Response**: Status, uptime, database connection
- **Use Case**: Load balancer health checks

## 🎯 Best Practices Implemented

1. **Input Validation**: Always validate at the boundary
2. **Security**: Sign inter-service communication
3. **Reliability**: Implement retries and circuit breakers
4. **Monitoring**: Comprehensive error tracking
5. **Documentation**: Clear API contracts
6. **Testing**: Example implementations provided
7. **Configuration**: Environment-driven settings
8. **Error Handling**: Graceful degradation

## 🔧 Troubleshooting

### Common Issues

#### 1. Validation Errors
```bash
# Check the validation schema
cat src/validation.js

# Verify input data format
curl -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"inputData": {"Driving_Cycle": {"Cycle_Type": 1}}}'
```

#### 2. HMAC Verification Failures
```bash
# Check SHARED_SECRET is set
echo $SHARED_SECRET

# Verify both backends use same secret
# Check env.example and .env files
```

#### 3. Rate Limiting
```bash
# Check current limits
curl -I http://localhost:4000/api/health

# Response headers show remaining requests
```

#### 4. Retry Failures
```bash
# Check validator is running
curl http://localhost:5001/health

# Verify network connectivity
ping localhost
```

## 📞 Support

For issues or questions:
1. Check the logs in both backend and validator
2. Verify environment variables are set correctly
3. Test individual endpoints for isolation
4. Review the validation schemas for data format issues

---

**Note**: This system is designed for production use with proper security configurations. Always set `SHARED_SECRET` in production environments and use HTTPS for all communications.
