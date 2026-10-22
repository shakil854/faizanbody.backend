import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  toggleTaskDone,
  deleteOrder,
  uploadPhotos,
  deletePhoto,
  deleteAllPhotos,
  streamPhoto,
  getOrderBadgeSettings,
  updateOrderBadgeSettings,
} from '../controllers/order.controller.js';
import { verifyToken, requirePermission } from '../middlewares/auth.middleware.js';
import { uploadOrderPhotos } from '../middlewares/upload.middleware.js';

const router = Router();

// Stream photo directly (accessible for displaying images)
router.get('/orders/photos/stream', streamPhoto);

// Order Badge & Alert Color Threshold Settings (synced to backend)
router.route('/orders/badge-settings')
  .get(verifyToken, getOrderBadgeSettings)
  .put(verifyToken, requirePermission('orders:edit'), updateOrderBadgeSettings);

// CRUD Operations: Available to users with corresponding permissions
router.route('/orders')
  .get(verifyToken, requirePermission('orders:view'), getOrders)
  .post(verifyToken, requirePermission('orders:create'), createOrder);

router.route('/orders/:id')
  .get(verifyToken, requirePermission('orders:view'), getOrderById)
  .put(verifyToken, requirePermission('orders:edit'), updateOrder)
  .delete(verifyToken, requirePermission('orders:delete'), deleteOrder);

// Quick toggle task checkbox (permission: orders:tasks or orders:edit)
router.route('/orders/:id/toggle-task')
  .patch(verifyToken, requirePermission('orders:tasks'), toggleTaskDone);

// Photo upload & delete for work orders
router.route('/orders/:id/photos')
  .post(verifyToken, requirePermission('orders:photos'), uploadOrderPhotos.array('photos', 10), uploadPhotos)
  .delete(verifyToken, requirePermission('orders:photos'), deleteAllPhotos);

router.route('/orders/:id/photos/:photoId')
  .delete(verifyToken, requirePermission('orders:photos'), deletePhoto);

export default router;

