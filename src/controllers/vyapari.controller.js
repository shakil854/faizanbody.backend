import { vyapariService } from '../services/vyapari.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getVyapariAccounts = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const accounts = await vyapariService.getAllAccounts({ search });
  return ApiResponse.success(res, accounts, 'Vyapari accounts retrieved successfully');
});

export const getVyapariAccountById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = await vyapariService.getAccountById(id);
  if (!account) {
    throw ApiError.notFound('Vyapari account not found');
  }
  return ApiResponse.success(res, account, 'Vyapari account details retrieved');
});

export const createVyapariAccount = asyncHandler(async (req, res) => {
  const { party_name, firm_name, phone, address, page_no, notes } = req.body;
  if (!party_name || !party_name.trim()) {
    throw ApiError.badRequest('Vyapari / Party Name is required (વેપારીનું નામ જરૂરી છે)');
  }

  const account = await vyapariService.createAccount({
    party_name,
    firm_name,
    phone,
    address,
    page_no,
    notes,
  });
  return ApiResponse.created(res, account, 'Vyapari account created successfully');
});

export const updateVyapariAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { party_name, firm_name, phone, address, page_no, notes } = req.body;
  if (!party_name || !party_name.trim()) {
    throw ApiError.badRequest('Vyapari / Party Name is required (વેપારીનું નામ જરૂરી છે)');
  }

  const account = await vyapariService.updateAccount(id, {
    party_name,
    firm_name,
    phone,
    address,
    page_no,
    notes,
  });
  return ApiResponse.success(res, account, 'Vyapari account updated successfully');
});

export const deleteVyapariAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await vyapariService.deleteAccount(id);
  return ApiResponse.success(res, { id: Number(id) }, 'Vyapari account deleted successfully');
});

export const setVyapariAccountReminder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reminder_date, reminder_note } = req.body;
  const account = await vyapariService.setAccountReminder(id, { reminder_date, reminder_note });
  return ApiResponse.success(res, account, reminder_date ? 'Reminder set successfully' : 'Reminder cleared');
});

export const addVyapariAccountEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, amount, date, particulars, payment_mode, add_to_rojmed, bill_no, stock_item_id, stock_qty } = req.body;

  if (amount === undefined || amount === null || Number(amount) <= 0) {
    throw ApiError.badRequest('Valid amount is required (માન્ય રકમ જરૂરી છે)');
  }

  const entry = await vyapariService.addEntry(id, {
    type,
    amount,
    date,
    particulars,
    payment_mode,
    add_to_rojmed,
    bill_no,
    stock_item_id,
    stock_qty,
  });

  const updatedAccount = await vyapariService.getAccountById(id);
  return ApiResponse.created(res, { entry, account: updatedAccount }, 'Entry added successfully');
});

export const updateVyapariAccountEntry = asyncHandler(async (req, res) => {
  const { id, entryId } = req.params;
  const { type, amount, date, particulars, payment_mode, add_to_rojmed, bill_no } = req.body;

  if (amount === undefined || amount === null || Number(amount) <= 0) {
    throw ApiError.badRequest('Valid amount is required (માન્ય રકમ જરૂરી છે)');
  }

  const entry = await vyapariService.updateEntry(id, entryId, {
    type,
    amount,
    date,
    particulars,
    payment_mode,
    add_to_rojmed,
    bill_no,
  });

  const updatedAccount = await vyapariService.getAccountById(id);
  return ApiResponse.success(res, { entry, account: updatedAccount }, 'Entry updated successfully');
});

export const deleteVyapariAccountEntry = asyncHandler(async (req, res) => {
  const { id, entryId } = req.params;
  await vyapariService.deleteEntry(id, entryId);
  const updatedAccount = await vyapariService.getAccountById(id);
  return ApiResponse.success(res, { entryId: Number(entryId), account: updatedAccount }, 'Entry deleted successfully');
});

export const settleVyapariAccountCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};
  const updatedAccount = await vyapariService.settleCycle(id, { notes });
  if (!updatedAccount) {
    throw ApiError.notFound('Vyapari account not found');
  }
  return ApiResponse.success(res, updatedAccount, 'Vyapari account cycle settled successfully');
});

export const reopenVyapariAccountCycle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updatedAccount = await vyapariService.reopenCycle(id);
  if (!updatedAccount) {
    throw ApiError.notFound('Vyapari account not found');
  }
  return ApiResponse.success(res, updatedAccount, 'Previous cycle reopened successfully');
});
