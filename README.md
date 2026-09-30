# 🚀 FaizanBody Backend API

Production-ready, Senior Software Engineer architecture using **Node.js, Express (ES Modules), and Clean Layered Design**.

---

## 📁 Project Structure

```text
faizanbody.backend/
├── src/
│   ├── config/             # Configuration & Environment
│   │   ├── env.js          # Centralized validated environment variables
│   │   └── db.js           # Database connection setup (MongoDB/PostgreSQL/MySQL ready)
│   ├── controllers/        # Request & Response Handlers (HTTP layer only)
│   │   ├── health.controller.js
│   │   └── sample.controller.js
│   ├── services/           # Pure Business Logic Layer
│   │   └── sample.service.js
│   ├── routes/             # API Endpoints Router Mapping
│   │   ├── index.js        # Central API router (/api/v1 prefix)
│   │   ├── health.routes.js
│   │   └── sample.routes.js
│   ├── middlewares/        # Express Middlewares
│   │   ├── error.middleware.js     # Centralized global error handler
│   │   └── notFound.middleware.js  # 404 handler
│   ├── utils/              # Standardized Helpers
│   │   ├── apiResponse.js  # Standard API JSON format (success, status, data, msg)
│   │   ├── apiError.js     # Custom Operational ApiError class
│   │   └── asyncHandler.js # Wraps async controllers (no try/catch boilerplate)
│   ├── app.js              # Express app setup (CORS, Morgan, JSON parser)
│   └── server.js           # Server bootstrap & graceful shutdown
├── .env                    # Environment variables (PORT, CLIENT_URL, etc.)
├── .env.example            # Example env template
├── .gitignore              # Git ignore rules
└── package.json            # Node scripts and dependencies
```

---

## ⚡ How to Run

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Start in Development Mode** (auto-restart on file change):
   ```bash
   npm run dev
   ```

3. **Start in Production Mode**:
   ```bash
   npm start
   ```

---

## 📡 Available Endpoints

- **Root API**: `http://localhost:5000/`
- **Health Check**: `GET http://localhost:5000/api/v1/health`
- **Welcome Info**: `GET http://localhost:5000/api/v1/welcome`
- **Sample Items**: `GET http://localhost:5000/api/v1/items`
