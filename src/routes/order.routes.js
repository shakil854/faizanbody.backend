import { Router } from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  toggleTaskDone,
  deleteOrder,
} from '../controllers/order.controller.js';
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

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

export default router;
