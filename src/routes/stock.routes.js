import { Router } from 'express';
import {
  getCategories,
  createCategory,
  deleteCategory,
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  adjustStock,
  getItemTransactions,
  getAllTransactions,
  getStockSummary,
} from '../controllers/stock.controller.js';
import { verifyToken, requirePermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Summary metrics
router.get('/stock/summary', verifyToken, requirePermission('stock:view'), getStockSummary);

// Transactions audit log
router.get('/stock/transactions', verifyToken, requirePermission('stock:transactions'), getAllTransactions);

// Categories
router.route('/stock/categories')
  .get(verifyToken, requirePermission('stock:view'), getCategories)
  .post(verifyToken, requirePermission('stock:category'), createCategory);

router.delete('/stock/categories/:id', verifyToken, requirePermission('stock:category'), deleteCategory);

// Stock Items CRUD
router.route('/stock/items')
  .get(verifyToken, requirePermission('stock:view'), getItems)
  .post(verifyToken, requirePermission('stock:create'), createItem);

router.route('/stock/items/:id')
  .get(verifyToken, requirePermission('stock:view'), getItemById)
  .put(verifyToken, requirePermission('stock:edit'), updateItem)
  .delete(verifyToken, requirePermission('stock:delete'), deleteItem);

// Stock Adjustments (IN / OUT) & History
router.post('/stock/items/:id/adjust', verifyToken, requirePermission('stock:adjust'), adjustStock);
router.get('/stock/items/:id/transactions', verifyToken, requirePermission('stock:transactions'), getItemTransactions);

export default router;
