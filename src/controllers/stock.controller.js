import { stockService } from '../services/stock.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/* ====================================================================
 * 🏷️ Categories
 * ==================================================================== */

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await stockService.getAllCategories();
  return ApiResponse.success(res, categories, 'Categories fetched successfully');
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Category name is required (कैटेगरी का नाम आवश्यक है)');
  }
  const category = await stockService.createCategory(name);
  return ApiResponse.created(res, category, 'Category created successfully');
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await stockService.deleteCategory(id);
    if (!deleted) {
      throw ApiError.notFound('Category not found');
    }
    return ApiResponse.success(res, { id }, 'Category deleted successfully');
  } catch (err) {
    if (err.message.includes('Cannot delete category')) {
      throw ApiError.badRequest(err.message);
    }
    throw err;
  }
});

/* ====================================================================
 * 📦 Stock Items
 * ==================================================================== */

export const getItems = asyncHandler(async (req, res) => {
  const { search = '', category = 'all', lowStockOnly } = req.query;
  const items = await stockService.getAllItems({
    search,
    category,
    lowStockOnly: lowStockOnly === 'true' || lowStockOnly === true,
  });
  return ApiResponse.success(res, items, 'Stock items fetched successfully');
});

export const getItemById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await stockService.getItemById(id);
  if (!item) {
    throw ApiError.notFound('Stock item not found');
  }
  return ApiResponse.success(res, item, 'Stock item details retrieved');
});

export const createItem = asyncHandler(async (req, res) => {
  const { name, category_name } = req.body;
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Item name is required (आइटम का नाम आवश्यक है)');
  }
  if (!category_name || !category_name.trim()) {
    throw ApiError.badRequest('Category is required (कैटेगरी चुनना आवश्यक है)');
  }

  const newItem = await stockService.createItem(req.body);
  return ApiResponse.created(res, newItem, 'Stock item created successfully');
});

export const updateItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await stockService.updateItem(id, req.body);
  if (!updated) {
    throw ApiError.notFound('Stock item not found');
  }
  return ApiResponse.success(res, updated, 'Stock item updated successfully');
});

export const deleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await stockService.deleteItem(id);
  if (!deleted) {
    throw ApiError.notFound('Stock item not found');
  }
  return ApiResponse.success(res, { id }, 'Stock item deleted successfully');
});

/* ====================================================================
 * 🔄 Stock Adjustments & Movement History
 * ==================================================================== */

export const adjustStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, quantity, date, reference_note } = req.body;

  if (!type || !['IN', 'OUT', 'ADJUSTMENT'].includes(type.toUpperCase())) {
    throw ApiError.badRequest('Valid type (IN, OUT, or ADJUSTMENT) is required');
  }

  if (quantity === undefined || quantity === null || isNaN(Number(quantity))) {
    throw ApiError.badRequest('Valid quantity number is required');
  }

  try {
    const updated = await stockService.adjustStock(id, {
      type,
      quantity,
      date,
      reference_note,
    });
    return ApiResponse.success(res, updated, 'Stock adjusted successfully');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
});

export const getItemTransactions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = await stockService.getItemTransactions(id);
  return ApiResponse.success(res, history, 'Item transaction history fetched');
});

export const getAllTransactions = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const history = await stockService.getAllTransactions({ limit });
  return ApiResponse.success(res, history, 'Stock movement audit log fetched');
});

export const getStockSummary = asyncHandler(async (req, res) => {
  const summary = await stockService.getStockSummary();
  return ApiResponse.success(res, summary, 'Stock summary metrics fetched');
});
