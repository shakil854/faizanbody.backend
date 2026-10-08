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
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';
import { uploadWorkerAadhar } from '../middlewares/upload.middleware.js';

const router = Router();

// Workshop-wide Khata Summary
router.get('/workers/khata/summary', verifyToken, getWorkshopKhataSummary);

// Upload Aadhar Card Photo (Camera click or gallery)
router.post(
  '/workers/upload-aadhar',
  verifyToken,
  authorizeRoles('admin'),
  uploadWorkerAadhar.any(),
  uploadAadharPhoto
);

// Worker Khata Transactions (Jama - Udhar)
router.route('/workers/:id/transactions')
  .get(verifyToken, getWorkerTransactions)
  .post(verifyToken, authorizeRoles('admin'), addWorkerTransaction);

router.delete(
  '/workers/:id/transactions/:transactionId',
  verifyToken,
  authorizeRoles('admin'),
  deleteWorkerTransaction
);

// Read operations: Available to authenticated users (admin & user)
router.route('/workers')
  .get(verifyToken, getWorkers)
  .post(verifyToken, authorizeRoles('admin'), createWorker);

router.route('/workers/:id')
  .get(verifyToken, getWorkerById)
  .put(verifyToken, authorizeRoles('admin'), updateWorker)
  .delete(verifyToken, authorizeRoles('admin'), deleteWorker);

export default router;
