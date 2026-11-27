import { Router } from 'express';
import {
  getDailyUpiRojmed,
  getUpiRojmedSummary,
  getUpiRojmedOptions,
  getUpiAccounts,
  createUpiAccount,
  updateUpiAccount,
  deleteUpiAccount,
  createUpiRojmedEntry,
  updateUpiRojmedEntry,
  deleteUpiRojmedEntry,
} from '../controllers/upiRojmed.controller.js';
import { verifyToken, requirePermission, requireAnyPermission } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/upi-rojmed/daily', verifyToken, requirePermission('rojmed:view'), getDailyUpiRojmed);
router.get('/upi-rojmed/summary', verifyToken, requirePermission('rojmed:view'), getUpiRojmedSummary);
router.get(
  '/upi-rojmed/options',
  verifyToken,
  requireAnyPermission('rojmed:view', 'rojmed:create', 'rojmed:edit'),
  getUpiRojmedOptions
);

router.route('/upi-rojmed/accounts')
  .get(verifyToken, requirePermission('rojmed:view'), getUpiAccounts)
  .post(verifyToken, requireAnyPermission('rojmed:create', 'rojmed:edit'), createUpiAccount);

router.route('/upi-rojmed/accounts/:id')
  .put(verifyToken, requireAnyPermission('rojmed:create', 'rojmed:edit'), updateUpiAccount)
  .delete(verifyToken, requirePermission('rojmed:delete'), deleteUpiAccount);

router.post('/upi-rojmed/entries', verifyToken, requirePermission('rojmed:create'), createUpiRojmedEntry);
router.put('/upi-rojmed/entries/:id', verifyToken, requirePermission('rojmed:edit'), updateUpiRojmedEntry);
router.delete('/upi-rojmed/entries/:id', verifyToken, requirePermission('rojmed:delete'), deleteUpiRojmedEntry);

export default router;
