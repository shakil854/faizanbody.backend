import { orderService } from '../services/order.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getOrders = asyncHandler(async (req, res) => {
  const { search = '', status = 'all' } = req.query;
  const orders = await orderService.getAllOrders({ search, status });
  return ApiResponse.success(res, orders, 'Orders fetched successfully');
});

export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await orderService.getOrderById(id);
  if (!order) {
    throw ApiError.notFound('Order not found');
  }
  return ApiResponse.success(res, order, 'Order details retrieved');
});

export const createOrder = asyncHandler(async (req, res) => {
  const { owner_name, truck_chassis_no } = req.body;

  if (!owner_name || !owner_name.trim()) {
    throw ApiError.badRequest('Owner name is required (मालिक का नाम आवश्यक है)');
  }
  if (!truck_chassis_no || !truck_chassis_no.trim()) {
    throw ApiError.badRequest('Truck/Chassis No is required (ट्रक / चेसिस नं आवश्यक है)');
  }

  const newOrder = await orderService.createOrder(req.body);
  return ApiResponse.created(res, newOrder, 'Work Order created successfully');
});

export const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { owner_name, truck_chassis_no } = req.body;

  if (owner_name !== undefined && !owner_name.trim()) {
    throw ApiError.badRequest('Owner name cannot be empty');
  }
  if (truck_chassis_no !== undefined && !truck_chassis_no.trim()) {
    throw ApiError.badRequest('Truck/Chassis No cannot be empty');
  }

  const updated = await orderService.updateOrder(id, req.body);
  if (!updated) {
    throw ApiError.notFound('Order not found');
  }

  return ApiResponse.success(res, updated, 'Order updated successfully');
});

export const toggleTaskDone = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { section, itemKey, done } = req.body;

  if (!section || !itemKey) {
    throw ApiError.badRequest('Section and itemKey are required');
  }

  const updated = await orderService.toggleTaskDone(id, { section, itemKey, done });
  if (!updated) {
    throw ApiError.notFound('Order not found');
  }

  return ApiResponse.success(res, updated, 'Task status updated');
});

export const deleteOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await orderService.deleteOrder(id);
  if (!deleted) {
    throw ApiError.notFound('Order not found or already deleted');
  }
  return ApiResponse.success(res, { id: Number(id) }, 'Order deleted successfully');
});
