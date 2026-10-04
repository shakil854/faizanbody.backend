import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middlewares/notFound.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

import path from 'path';

const app = express();

// Serve local uploads folder if fallback used
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ==========================================
// Global Middlewares
// ==========================================
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching frontend
      if (!origin || origin === config.clientUrl || config.nodeEnv === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
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
