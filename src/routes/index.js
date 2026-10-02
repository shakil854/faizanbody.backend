import { Router } from 'express';
import healthRoutes from './health.routes.js';
import sampleRoutes from './sample.routes.js';
import workerRoutes from './worker.routes.js';
import orderRoutes from './order.routes.js';
import authRoutes from './auth.routes.js';

const router = Router();

// Mount domain routes under central router
router.use('/', healthRoutes);
router.use('/', sampleRoutes);
router.use('/', workerRoutes);
router.use('/', orderRoutes);
router.use('/', authRoutes);

export default router;
