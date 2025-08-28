# eBRT 2030 Backend + Frontend Serving

A secure, production-ready backend system for the eBRT 2030 simulation application with comprehensive error handling, environment configuration, and MongoDB integration.

## 🚀 Features

- **Secure API endpoints** with input validation and error handling
- **Environment-based configuration** with dotenv support
- **MongoDB integration** with Mongoose ORM
- **External validator integration** with timeout and retry logic
- **File system management** for JSON storage
- **Health monitoring** and graceful shutdown
- **CORS configuration** and security headers
- **Comprehensive logging** with development/production modes

## 📋 Setup

### Prerequisites

1. **Node.js** (v16 or higher)
2. **MongoDB** (v4.4 or higher) - *Optional for development*
3. **npm** or **yarn**
4. **Two available ports**: 4000 (backend) and 5001 (validator)

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start the services:**
   ```bash
   # Terminal 1: Start the main backend
   npm start
   
   # Terminal 2: Start the validator (required for full functionality)
   node validator-example.js
   ```

4. **Access the application:**
   - Frontend: `http://localhost:4000/`
   - Health Check: `http://localhost:4000/api/health`
   - Validator Health: `http://localhost:5001/health`

**Important**: Both services must be running for the complete simulation flow to work!

## 🔧 Environment Configuration

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/ebrt` |
| `VALIDATOR_URL` | External validator endpoint | `http://localhost:5001/validate` |
| `SHARED_SECRET` | HMAC signing secret for backend communication | *Must be set* |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment mode | `development` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `REQUEST_TIMEOUT` | HTTP request timeout (ms) | `15000` |
| `MAX_FILE_SIZE` | Max request body size (bytes) | `2097152` |

## 📡 API Endpoints

### Health Check
- **GET** `/api/health` - Server health and status

### Simulation Management
- **POST** `/api/save-input` - Save user input data
  ```json
  {
    "userId": "optional_user_id",
    "inputData": { /* simulation configuration */ }
  }
  ```

- **POST** `/api/send-to-validator` - Send data to external validator
  ```json
  {
    "id": "simulation_id"
  }
  ```

- **GET** `/api/results/:id` - Get simulation results

## 🔧 Troubleshooting

### Common Issues

#### 1. "Spec file not found" Error
- Ensure `SPEC_PATH` in `.env` points to `./json/driveCycleOption.json`
- Check that the file exists and contains `backend_payload_template`

#### 2. MongoDB Connection Failed
- **Development**: Server will start with warnings, but database operations will fail
- **Production**: Ensure MongoDB is running and accessible
- Check connection string in `MONGODB_URI`

#### 3. Validator Connection Failed
- Ensure validator service is running on port 5001
- Check `VALIDATOR_URL` in `.env`
- Verify both services use the same `SHARED_SECRET`

#### 4. Port Already in Use
- Check if services are already running: `netstat -ano | findstr :4000`
- Kill existing processes or change ports in `.env`

### Service Status Check
```bash
# Check backend health
curl http://localhost:4000/api/health

# Check validator health  
curl http://localhost:5001/health

# Check MongoDB (if running)
mongosh --eval "db.runCommand('ping')"
```

## 🔄 Frontend Flow

1. **Drive Cycle Options** (`driveCycleOption.html`)
   - Loads configuration from `/json/driveCycleOption.json`
   - Stores selections in `localStorage`

2. **Environment & Vehicle Parameters** (`environmentVehicleParameters.html`)
   - Collects slider and input values
   - Stores in `localStorage`

3. **Parameter Selection** (`parameter.html`)
   - Composes all data and calls `/api/save-input`
   - Redirects to simulation interface

4. **Simulation Interface** (`simulationInterface.html`)
   - Triggers `/api/send-to-validator`
   - Polls `/api/results/:id` for completion
   - Redirects to output page

5. **Simulation Output** (`simulationOutput.html`)
   - Displays validated results from `app/simulationOutput/<id>.json`
   - Falls back to API if file not available

## 📁 File Structure

```
final/
├── src/
│   └── server.js          # Main server file
├── app/                   # Frontend files
│   ├── *.html            # HTML pages
│   ├── js/               # JavaScript files
│   ├── css/              # Stylesheets
│   └── simulationOutput/ # Generated output files
├── json/                 # Configuration files
├── data/
│   └── inputJSON/        # Stored input data
├── package.json
├── env.example           # Environment template
└── README.md
```

## 🔒 Security Features

- **Input validation** on all endpoints
- **Security headers** (XSS protection, content type options)
- **CORS configuration** with origin control
- **Request size limits** to prevent abuse
- **Error handling** without information leakage
- **Graceful shutdown** handling

## 🐛 Error Handling

The backend includes comprehensive error handling:

- **400 Bad Request** - Invalid input data
- **404 Not Found** - Resource not found
- **422 Unprocessable Entity** - Invalid validator response
- **500 Internal Server Error** - Server-side errors
- **502 Bad Gateway** - Validator service unavailable

## 📊 Monitoring

- **Health check endpoint** with database status
- **Structured logging** with emojis for easy reading
- **Request/response logging** in development mode
- **Error tracking** with detailed messages

## 🚀 Production Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Configure proper `MONGODB_URI`
3. Set `VALIDATOR_URL` to production endpoint
4. Configure `CORS_ORIGIN` for your domain
5. Set up process manager (PM2, Docker, etc.)
6. Configure reverse proxy (nginx, Apache)

## 🤝 Contributing

1. Follow the existing code style
2. Add proper error handling
3. Update environment variables if needed
4. Test all endpoints
5. Update documentation


