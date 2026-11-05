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
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// Quotations module is strictly restricted to Admin role only
router.use(verifyToken, authorizeRoles('admin'));

// Body Defaults (Master default rates and weights for 6 body parts: Taliyu, Side, Dhoka, Thambhla, Purchuran, Machado)
router.route('/quotations/body-defaults')
  .get(getBodyDefaults)
  .post(saveBodyDefaults);

// Catalog Items (Saved items & rates)
router.route('/quotations/catalog/items')
  .get(getCatalogItems)
  .post(saveCatalogItem);

router.route('/quotations/catalog/items/:id')
  .delete(deleteCatalogItem);

// Quotations CRUD
router.route('/quotations')
  .get(getQuotations)
  .post(createQuotation);

router.route('/quotations/:id')
  .get(getQuotationById)
  .put(updateQuotation)
  .delete(deleteQuotation);

export default router;
