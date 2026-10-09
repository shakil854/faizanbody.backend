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
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Summary metrics
router.get('/stock/summary', verifyToken, getStockSummary);

// Transactions audit log
router.get('/stock/transactions', verifyToken, getAllTransactions);

// Categories
router.route('/stock/categories')
  .get(verifyToken, getCategories)
  .post(verifyToken, createCategory);

router.delete('/stock/categories/:id', verifyToken, deleteCategory);

// Stock Items CRUD
router.route('/stock/items')
  .get(verifyToken, getItems)
  .post(verifyToken, createItem);

router.route('/stock/items/:id')
  .get(verifyToken, getItemById)
  .put(verifyToken, updateItem)
  .delete(verifyToken, deleteItem);

// Stock Adjustments (IN / OUT) & History
router.post('/stock/items/:id/adjust', verifyToken, adjustStock);
router.get('/stock/items/:id/transactions', verifyToken, getItemTransactions);

export default router;
