import { Router } from 'express';
import healthRoutes from './health.routes.js';
import sampleRoutes from './sample.routes.js';

const router = Router();

// Mount domain routes under central router
router.use('/', healthRoutes);
router.use('/', sampleRoutes);

export default router;
