import app from './app.js';
import { config } from './config/env.js';
import { connectDB } from './config/db.js';

const startServer = async () => {
  try {
    // 1. Connect to Database (if applicable)
    await connectDB();

    // 2. Start Express Server
    const server = app.listen(config.port, () => {
      console.log(`\n==================================================`);
      console.log(`🚀 FaizanBody Backend is live!`);
      console.log(`📡 URL: http://localhost:${config.port}`);
      console.log(`🩺 Health Check: http://localhost:${config.port}${config.apiPrefix}/health`);
      console.log(`🛠️ Environment: ${config.nodeEnv}`);
      console.log(`==================================================\n`);
    });

    // 3. Graceful Shutdown & Process Monitoring
    const handleShutdown = (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      console.error('💥 Unhandled Rejection! Shutting down...', err);
      server.close(() => {
        process.exit(1);
      });
    });

    process.on('uncaughtException', (err) => {
      console.error('💥 Uncaught Exception! Shutting down...', err);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
