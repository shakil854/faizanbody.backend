import { truckAccountService } from '../services/truckAccount.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getTruckAccounts = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const accounts = await truckAccountService.getAllAccounts({ search });
  return ApiResponse.success(res, accounts, 'Truck accounts retrieved successfully');
});

export const getTruckAccountById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const account = await truckAccountService.getAccountById(id);
  if (!account) {
    throw ApiError.notFound('Truck account not found');
  }
  return ApiResponse.success(res, account, 'Truck account details retrieved');
});

export const createTruckAccount = asyncHandler(async (req, res) => {
  const { party_name, truck_no, phone, address, page_no, notes } = req.body;
  if (!party_name || !party_name.trim()) {
    throw ApiError.badRequest('Party / Owner Name is required (પાર્ટીનું નામ જરૂરી છે)');
  }

  const account = await truckAccountService.createAccount({
    party_name,
    truck_no,
    phone,
    address,
    page_no,
    notes,
  });
  return ApiResponse.created(res, account, 'Truck account created successfully');
});

export const updateTruckAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { party_name, truck_no, phone, address, page_no, notes } = req.body;
  if (!party_name || !party_name.trim()) {
    throw ApiError.badRequest('Party / Owner Name is required (પાર્ટીનું નામ જરૂરી છે)');
  }

  const account = await truckAccountService.updateAccount(id, {
    party_name,
    truck_no,
    phone,
    address,
    page_no,
    notes,
  });
  return ApiResponse.success(res, account, 'Truck account updated successfully');
});

export const deleteTruckAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await truckAccountService.deleteAccount(id);
  return ApiResponse.success(res, { id: Number(id) }, 'Truck account deleted successfully');
});

export const addTruckAccountEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, amount, date, particulars, payment_mode } = req.body;

  if (amount === undefined || amount === null || Number(amount) <= 0) {
    throw ApiError.badRequest('Valid amount is required (માન્ય રકમ જરૂરી છે)');
  }

  const entry = await truckAccountService.addEntry(id, {
    type,
    amount,
    date,
    particulars,
    payment_mode,
  });

  const updatedAccount = await truckAccountService.getAccountById(id);
  return ApiResponse.created(res, { entry, account: updatedAccount }, 'Entry added successfully');
});

export const updateTruckAccountEntry = asyncHandler(async (req, res) => {
  const { id, entryId } = req.params;
  const { type, amount, date, particulars, payment_mode } = req.body;

  if (amount === undefined || amount === null || Number(amount) <= 0) {
    throw ApiError.badRequest('Valid amount is required (માન્ય રકમ જરૂરી છે)');
  }

  const entry = await truckAccountService.updateEntry(id, entryId, {
    type,
    amount,
    date,
    particulars,
    payment_mode,
  });

  const updatedAccount = await truckAccountService.getAccountById(id);
  return ApiResponse.success(res, { entry, account: updatedAccount }, 'Entry updated successfully');
});

export const deleteTruckAccountEntry = asyncHandler(async (req, res) => {
  const { id, entryId } = req.params;
  await truckAccountService.deleteEntry(id, entryId);
  const updatedAccount = await truckAccountService.getAccountById(id);
  return ApiResponse.success(res, { entryId: Number(entryId), account: updatedAccount }, 'Entry deleted successfully');
});

