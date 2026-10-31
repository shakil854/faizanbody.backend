import { quotationService } from '../services/quotation.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getQuotations = asyncHandler(async (req, res) => {
  const { search = '', status = 'all' } = req.query;
  const list = await quotationService.getAllQuotations({ search, status });
  return ApiResponse.success(res, list, 'Quotations fetched successfully');
});

export const getQuotationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const quote = await quotationService.getQuotationById(id);
  if (!quote) {
    throw ApiError.notFound('Quotation not found');
  }
  return ApiResponse.success(res, quote, 'Quotation details retrieved');
});

export const createQuotation = asyncHandler(async (req, res) => {
  const { customer_name } = req.body;
  if (!customer_name || !customer_name.trim()) {
    throw ApiError.badRequest('Customer name is required (ग्राहक का नाम आवश्यक है)');
  }

  const newQuote = await quotationService.createQuotation(req.body);
  return ApiResponse.created(res, newQuote, 'Quotation created successfully');
});

export const updateQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { customer_name } = req.body;
  if (customer_name !== undefined && !customer_name.trim()) {
    throw ApiError.badRequest('Customer name cannot be empty');
  }

  const updated = await quotationService.updateQuotation(id, req.body);
  if (!updated) {
    throw ApiError.notFound('Quotation not found');
  }
  return ApiResponse.success(res, updated, 'Quotation updated successfully');
});

export const deleteQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await quotationService.deleteQuotation(id);
  return ApiResponse.success(res, { id }, 'Quotation deleted successfully');
});

export const getCatalogItems = asyncHandler(async (req, res) => {
  const items = await quotationService.getCatalogItems();
  return ApiResponse.success(res, items, 'Catalog items retrieved');
});

export const saveCatalogItem = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw ApiError.badRequest('Item name is required');
  }
  const item = await quotationService.saveCatalogItem(req.body);
  return ApiResponse.success(res, item, 'Catalog item saved successfully');
});

export const deleteCatalogItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await quotationService.deleteCatalogItem(id);
  return ApiResponse.success(res, { id }, 'Catalog item deleted successfully');
});

