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
import { verifyToken, requireAnyPermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Truck Accounts CRUD (Matches Workers & Other modules permission flow)
router.route('/truck-accounts')
  .get(verifyToken, requireAnyPermission('truck_accounts:view', 'workers:view'), getTruckAccounts)
  .post(verifyToken, requireAnyPermission('truck_accounts:create', 'workers:create'), createTruckAccount);

router.route('/truck-accounts/:id')
  .get(verifyToken, requireAnyPermission('truck_accounts:view', 'workers:view'), getTruckAccountById)
  .put(verifyToken, requireAnyPermission('truck_accounts:edit', 'workers:edit'), updateTruckAccount)
  .delete(verifyToken, requireAnyPermission('truck_accounts:delete', 'workers:delete'), deleteTruckAccount);

// Truck Account Entries (Jama / Udhar)
router.route('/truck-accounts/:id/entries')
  .post(verifyToken, requireAnyPermission('truck_accounts:khata', 'workers:khata'), addTruckAccountEntry);

router.route('/truck-accounts/:id/entries/:entryId')
  .put(verifyToken, requireAnyPermission('truck_accounts:khata', 'workers:khata'), updateTruckAccountEntry)
  .delete(verifyToken, requireAnyPermission('truck_accounts:khata', 'workers:khata'), deleteTruckAccountEntry);

export default router;
