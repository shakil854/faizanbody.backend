import { Router } from 'express';
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  getCatalogItems,
  saveCatalogItem,
  deleteCatalogItem,
} from '../controllers/quotation.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Catalog Items (Saved items & rates)
router.route('/quotations/catalog/items')
  .get(verifyToken, getCatalogItems)
  .post(verifyToken, saveCatalogItem);

router.route('/quotations/catalog/items/:id')
  .delete(verifyToken, deleteCatalogItem);

// Quotations CRUD
router.route('/quotations')
  .get(verifyToken, getQuotations)
  .post(verifyToken, createQuotation);

router.route('/quotations/:id')
  .get(verifyToken, getQuotationById)
  .put(verifyToken, updateQuotation)
  .delete(verifyToken, deleteQuotation);

export default router;

