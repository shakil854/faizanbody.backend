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
  settleTruckAccountCycle,
  reopenTruckAccountCycle,
  setTruckAccountReminder,
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

// Truck Account Cycles (Settle / Reopen - Gated by truck_accounts:khata)
router.post('/truck-accounts/:id/settle-cycle', verifyToken, requirePermission('truck_accounts:khata'), settleTruckAccountCycle);
router.post('/truck-accounts/:id/reopen-cycle', verifyToken, requirePermission('truck_accounts:khata'), reopenTruckAccountCycle);
router.put('/truck-accounts/:id/reminder', verifyToken, requireAnyPermission('truck_accounts:khata', 'truck_accounts:edit'), setTruckAccountReminder);

export default router;
