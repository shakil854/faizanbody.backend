import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middlewares/notFound.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

import path from 'path';

const app = express();

// Serve local uploads folder with complete CORS headers so mobile app & browsers can fetch blobs
app.use(
  '/uploads',
  cors(),
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  },
  express.static(path.join(process.cwd(), 'uploads'))
);

// ==========================================
// Global Middlewares
// ==========================================
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin, matching clientUrl, wildcard, or local dev
      if (
        !origin ||
        config.clientUrl === '*' ||
        origin === config.clientUrl ||
        config.nodeEnv === 'development' ||
        origin.includes('localhost')
      ) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// ==========================================
// Base Root Endpoint
// ==========================================
app.get('/', (req, res) => {
  res.json({
    message: '🚀 FaizanBody Backend API Server is running',
    version: '1.0.0',
    apiDocs: `${config.apiPrefix}/health`,
  });
});

// ==========================================
// Mount Modular API Routes
// ==========================================
app.use(config.apiPrefix, apiRoutes);

// ==========================================
// Fallback & Error Handling Middlewares
// ==========================================
app.use(notFound);
app.use(errorHandler);

export default app;
