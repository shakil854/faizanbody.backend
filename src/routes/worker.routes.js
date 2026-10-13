import { Router } from 'express';
import {
  getWorkers,
  getWorkerById,
  createWorker,
  updateWorker,
  deleteWorker,
  uploadAadharPhoto,
  getWorkerTransactions,
  addWorkerTransaction,
  deleteWorkerTransaction,
  getWorkshopKhataSummary,
} from '../controllers/worker.controller.js';
import { verifyToken, requirePermission } from '../middlewares/auth.middleware.js';
import { uploadWorkerAadhar } from '../middlewares/upload.middleware.js';

const router = Router();

// Workshop-wide Khata Summary
router.get('/workers/khata/summary', verifyToken, requirePermission('workers:khata'), getWorkshopKhataSummary);

// Upload Aadhar Card Photo (Camera click or gallery)
router.post(
  '/workers/upload-aadhar',
  verifyToken,
  requirePermission('workers:aadhar'),
  uploadWorkerAadhar.any(),
  uploadAadharPhoto
);

// Worker Khata Transactions (Jama - Udhar)
router.route('/workers/:id/transactions')
  .get(verifyToken, requirePermission('workers:khata'), getWorkerTransactions)
  .post(verifyToken, requirePermission('workers:khata'), addWorkerTransaction);

router.delete(
  '/workers/:id/transactions/:transactionId',
  verifyToken,
  requirePermission('workers:khata'),
  deleteWorkerTransaction
);

// Workers CRUD operations
router.route('/workers')
  .get(verifyToken, requirePermission('workers:view'), getWorkers)
  .post(verifyToken, requirePermission('workers:create'), createWorker);

router.route('/workers/:id')
  .get(verifyToken, requirePermission('workers:view'), getWorkerById)
  .put(verifyToken, requirePermission('workers:edit'), updateWorker)
  .delete(verifyToken, requirePermission('workers:delete'), deleteWorker);

export default router;
