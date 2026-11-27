import { Router } from 'express';
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';
import {
  createDeleteRequest,
  listDeleteRequests,
  getPendingDeleteRequestCount,
  getPendingDeleteRequestKeys,
  approveDeleteRequest,
  rejectDeleteRequest,
} from '../controllers/deleteRequest.controller.js';

const router = Router();

router.use('/delete-requests', verifyToken);

router.get('/delete-requests', listDeleteRequests);
router.post('/delete-requests', createDeleteRequest);
router.get('/delete-requests/pending-count', getPendingDeleteRequestCount);
router.get('/delete-requests/pending-keys', getPendingDeleteRequestKeys);
router.post('/delete-requests/:id/approve', authorizeRoles('admin'), approveDeleteRequest);
router.post('/delete-requests/:id/reject', authorizeRoles('admin'), rejectDeleteRequest);

export default router;

