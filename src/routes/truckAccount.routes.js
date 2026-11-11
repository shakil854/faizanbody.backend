import { Router } from 'express';
import {
  getTruckAccounts,
  getTruckAccountById,
  createTruckAccount,
  updateTruckAccount,
  deleteTruckAccount,
  addTruckAccountEntry,
  updateTruckAccountEntry,
  deleteTruckAccountEntry,
} from '../controllers/truckAccount.controller.js';
import { verifyToken, requirePermission, requireAnyPermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Truck Accounts CRUD (Strictly gated by truck_accounts:* permissions)
router.route('/truck-accounts')
  .get(verifyToken, requirePermission('truck_accounts:view'), getTruckAccounts)
  .post(verifyToken, requirePermission('truck_accounts:create'), createTruckAccount);

router.route('/truck-accounts/:id')
  .get(verifyToken, requireAnyPermission('truck_accounts:khata', 'truck_accounts:print'), getTruckAccountById)
  .put(verifyToken, requirePermission('truck_accounts:edit'), updateTruckAccount)
  .delete(verifyToken, requirePermission('truck_accounts:delete'), deleteTruckAccount);

// Truck Account Entries (Jama / Udhar - Strictly gated by truck_accounts:khata)
router.route('/truck-accounts/:id/entries')
  .post(verifyToken, requirePermission('truck_accounts:khata'), addTruckAccountEntry);

router.route('/truck-accounts/:id/entries/:entryId')
  .put(verifyToken, requirePermission('truck_accounts:khata'), updateTruckAccountEntry)
  .delete(verifyToken, requirePermission('truck_accounts:khata'), deleteTruckAccountEntry);

export default router;
