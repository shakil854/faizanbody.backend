import { Router } from 'express';
import {
  getDailyRojmed,
  getRojmedSummary,
  getRojmedAccountOptions,
  setRojmedOpening,
  createRojmedEntry,
  updateRojmedEntry,
  deleteRojmedEntry,
} from '../controllers/rojmed.controller.js';
import { verifyToken, requirePermission, requireAnyPermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Daily Rojmed (રોજમેળ) Routes
router.get('/rojmed/daily', verifyToken, requirePermission('rojmed:view'), getDailyRojmed);
router.get('/rojmed/summary', verifyToken, requirePermission('rojmed:view'), getRojmedSummary);
router.get(
  '/rojmed/accounts-options',
  verifyToken,
  requireAnyPermission('rojmed:view', 'rojmed:create', 'rojmed:edit'),
  getRojmedAccountOptions
);

router.put(
  '/rojmed/opening',
  verifyToken,
  requireAnyPermission('rojmed:create', 'rojmed:edit'),
  setRojmedOpening
);

router.post('/rojmed/entries', verifyToken, requirePermission('rojmed:create'), createRojmedEntry);
router.put('/rojmed/entries/:id', verifyToken, requirePermission('rojmed:edit'), updateRojmedEntry);
router.delete('/rojmed/entries/:id', verifyToken, requirePermission('rojmed:delete'), deleteRojmedEntry);

export default router;

