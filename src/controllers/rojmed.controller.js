import { rojmedService } from '../services/rojmed.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function validateEntryPayload(body) {
  const { entry_type, amount, particulars, source_type = 'general', source_id, sub_type, date, notes } = body || {};

  if (!['aavak', 'javak'].includes(entry_type)) {
    throw ApiError.badRequest('Valid entry_type is required (aavak or javak)');
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw ApiError.badRequest('Valid positive amount is required (માન્ય રકમ જરૂરી છે)');
  }

  if (!['general', 'worker', 'truck_account'].includes(source_type)) {
    throw ApiError.badRequest('Invalid source_type (must be general, worker, or truck_account)');
  }

  if (source_type === 'general' && (!particulars || !String(particulars).trim())) {
    throw ApiError.badRequest('Particulars / description is required (વિગત જરૂરી છે)');
  }

  if ((source_type === 'worker' || source_type === 'truck_account') && (!source_id || Number(source_id) <= 0)) {
    throw ApiError.badRequest(
      source_type === 'worker'
        ? 'Please select a Worker (કારીગર પસંદ કરો)'
        : 'Please select a Truck Account (ગાડી ખાતું પસંદ કરો)'
    );
  }

  return {
    entry_type,
    amount: numAmount,
    particulars: particulars ? String(particulars).trim() : '',
    source_type,
    source_id: source_id ? Number(source_id) : null,
    sub_type,
    date,
    notes: notes ? String(notes).trim() : '',
  };
}

export const getDailyRojmed = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const sheet = await rojmedService.getDailySheet(date);
  return ApiResponse.success(res, sheet, 'Daily Rojmed retrieved successfully');
});

export const getRojmedSummary = asyncHandler(async (req, res) => {
  const { month = '', startDate = '', endDate = '' } = req.query;
  const summary = await rojmedService.getPeriodSummary({ month, startDate, endDate });
  return ApiResponse.success(res, summary, 'Rojmed summary retrieved successfully');
});

export const getRojmedAccountOptions = asyncHandler(async (req, res) => {
  const options = await rojmedService.getAccountsOptions();
  return ApiResponse.success(res, options, 'Rojmed account options retrieved');
});

export const setRojmedOpening = asyncHandler(async (req, res) => {
  const { date, opening_balance, notes = '', clear = false } = req.body || {};

  if (!clear) {
    const numBal = Number(opening_balance);
    if (opening_balance === undefined || opening_balance === null || opening_balance === '' || !Number.isFinite(numBal)) {
      throw ApiError.badRequest('Valid Opening Silak amount is required (માન્ય ઓપનિંગ સિલક જરૂરી છે)');
    }
  }

  const sheet = await rojmedService.setDailyOpening({
    date,
    opening_balance,
    notes,
    clear: Boolean(clear),
    userId: req.user?.id || null,
  });

  return ApiResponse.success(
    res,
    sheet,
    clear ? 'Opening Silak reverted to auto carry-forward' : 'Opening Silak updated successfully'
  );
});

export const createRojmedEntry = asyncHandler(async (req, res) => {
  const payload = validateEntryPayload(req.body);

  try {
    const result = await rojmedService.createEntry(payload, req.user?.id || null);
    return ApiResponse.created(res, result, 'Rojmed entry added successfully');
  } catch (err) {
    if (err.statusCode === 404) {
      throw ApiError.notFound(err.message);
    }
    throw err;
  }
});

export const updateRojmedEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = validateEntryPayload(req.body);

  try {
    const result = await rojmedService.updateEntry(id, payload);
    if (!result) {
      throw ApiError.notFound('Rojmed entry not found');
    }
    return ApiResponse.success(res, result, 'Rojmed entry updated successfully');
  } catch (err) {
    if (err.statusCode === 404) {
      throw ApiError.notFound(err.message);
    }
    throw err;
  }
});

export const deleteRojmedEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await rojmedService.deleteEntry(id);
  if (!result) {
    throw ApiError.notFound('Rojmed entry not found');
  }
  return ApiResponse.success(res, result, 'Rojmed entry deleted successfully');
});

