import { Router } from 'express';
import {
  getVyapariAccounts,
  getVyapariAccountById,
  createVyapariAccount,
  updateVyapariAccount,
  deleteVyapariAccount,
  addVyapariAccountEntry,
  updateVyapariAccountEntry,
  deleteVyapariAccountEntry,
  settleVyapariAccountCycle,
  reopenVyapariAccountCycle,
  setVyapariAccountReminder,
} from '../controllers/vyapari.controller.js';
import { verifyToken, requirePermission, requireAnyPermission } from '../middlewares/auth.middleware.js';

const router = Router();

// Vyapari Accounts CRUD (Strictly gated by vyapari:* permissions)
router.route('/vyapari-accounts')
  .get(verifyToken, requirePermission('vyapari:view'), getVyapariAccounts)
  .post(verifyToken, requirePermission('vyapari:create'), createVyapariAccount);

router.route('/vyapari-accounts/:id')
  .get(verifyToken, requireAnyPermission('vyapari:khata', 'vyapari:print'), getVyapariAccountById)
  .put(verifyToken, requirePermission('vyapari:edit'), updateVyapariAccount)
  .delete(verifyToken, requirePermission('vyapari:delete'), deleteVyapariAccount);

// Vyapari Account Entries (Jama / Udhar - Strictly gated by vyapari:khata)
router.route('/vyapari-accounts/:id/entries')
  .post(verifyToken, requirePermission('vyapari:khata'), addVyapariAccountEntry);

router.route('/vyapari-accounts/:id/entries/:entryId')
  .put(verifyToken, requirePermission('vyapari:khata'), updateVyapariAccountEntry)
  .delete(verifyToken, requirePermission('vyapari:khata'), deleteVyapariAccountEntry);

// Vyapari Account Cycles (Settle / Reopen - Gated by vyapari:khata)
router.post('/vyapari-accounts/:id/settle-cycle', verifyToken, requirePermission('vyapari:khata'), settleVyapariAccountCycle);
router.post('/vyapari-accounts/:id/reopen-cycle', verifyToken, requirePermission('vyapari:khata'), reopenVyapariAccountCycle);
router.put('/vyapari-accounts/:id/reminder', verifyToken, requireAnyPermission('vyapari:khata', 'vyapari:edit'), setVyapariAccountReminder);

export default router;
