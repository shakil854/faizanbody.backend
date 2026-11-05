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
  getBodyDefaults,
  saveBodyDefaults,
} from '../controllers/quotation.controller.js';
import { verifyToken, requirePermission, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// Body Defaults (Master default rates and weights for 6 body parts: Taliyu, Side, Dhoka, Thambhla, Purchuran, Machado)
router.route('/quotations/body-defaults')
  .get(verifyToken, requirePermission('quotations:view'), getBodyDefaults)
  .post(verifyToken, authorizeRoles('admin'), saveBodyDefaults);

// Catalog Items (Saved items & rates)
router.route('/quotations/catalog/items')
  .get(verifyToken, requirePermission('quotations:view'), getCatalogItems)
  .post(verifyToken, authorizeRoles('admin'), saveCatalogItem);

router.route('/quotations/catalog/items/:id')
  .delete(verifyToken, authorizeRoles('admin'), deleteCatalogItem);

// Quotations CRUD (Protected by granular permissions, Admin has automatic full access)
router.route('/quotations')
  .get(verifyToken, requirePermission('quotations:view'), getQuotations)
  .post(verifyToken, requirePermission('quotations:create'), createQuotation);

router.route('/quotations/:id')
  .get(verifyToken, requirePermission('quotations:view'), getQuotationById)
  .put(verifyToken, requirePermission('quotations:edit'), updateQuotation)
  .delete(verifyToken, requirePermission('quotations:delete'), deleteQuotation);

export default router;
