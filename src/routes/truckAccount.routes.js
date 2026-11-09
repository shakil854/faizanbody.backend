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
import { verifyToken, requirePermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Truck Accounts CRUD
router.route('/truck-accounts')
  .get(verifyToken, getTruckAccounts)
  .post(verifyToken, createTruckAccount);

router.route('/truck-accounts/:id')
  .get(verifyToken, getTruckAccountById)
  .put(verifyToken, updateTruckAccount)
  .delete(verifyToken, deleteTruckAccount);

// Truck Account Entries (Jama / Udhar)
router.route('/truck-accounts/:id/entries')
  .post(verifyToken, addTruckAccountEntry);

router.route('/truck-accounts/:id/entries/:entryId')
  .put(verifyToken, updateTruckAccountEntry)
  .delete(verifyToken, deleteTruckAccountEntry);

export default router;

