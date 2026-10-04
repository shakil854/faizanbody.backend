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
  streamPhoto,
} from '../controllers/order.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { uploadOrderPhotos } from '../middlewares/upload.middleware.js';

const router = Router();

// Stream photo directly (accessible for displaying images)
router.get('/orders/photos/stream', streamPhoto);

// CRUD Operations: Available to authenticated users
router.route('/orders')
  .get(verifyToken, getOrders)
  .post(verifyToken, createOrder);

router.route('/orders/:id')
  .get(verifyToken, getOrderById)
  .put(verifyToken, updateOrder)
  .delete(verifyToken, deleteOrder);

// Quick toggle task checkbox (accessible by all authenticated users)
router.route('/orders/:id/toggle-task')
  .patch(verifyToken, toggleTaskDone);

// Photo upload & delete for work orders
router.route('/orders/:id/photos')
  .post(verifyToken, uploadOrderPhotos.array('photos', 10), uploadPhotos);

router.route('/orders/:id/photos/:photoId')
  .delete(verifyToken, deletePhoto);

export default router;

