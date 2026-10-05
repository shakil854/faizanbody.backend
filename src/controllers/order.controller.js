import { orderService } from '../services/order.service.js';
import { r2Service } from '../services/r2.service.js';
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

/**
 * Upload photos for an order (supports single or multiple photos)
 */
export const uploadPhotos = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const files = req.files;

  if (!files || files.length === 0) {
    throw ApiError.badRequest('Please select at least one photo to upload');
  }

  const existingOrder = await orderService.getOrderById(id);
  if (!existingOrder) {
    throw ApiError.notFound('Work order not found');
  }

  const uploadedList = await Promise.all(
    files.map((file) =>
      r2Service.uploadPhoto({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        orderId: id,
      })
    )
  );

  const updatedOrder = await orderService.addPhotosToOrder(id, uploadedList);
  return ApiResponse.success(res, updatedOrder, `${uploadedList.length} photo(s) uploaded successfully`);
});

/**
 * Delete a specific photo from an order
 */
export const deletePhoto = asyncHandler(async (req, res) => {
  const { id, photoId } = req.params;
  const updatedOrder = await orderService.deletePhotoFromOrder(id, photoId);
  if (!updatedOrder) {
    throw ApiError.notFound('Order not found');
  }
  return ApiResponse.success(res, updatedOrder, 'Photo deleted successfully');
});

/**
 * Delete all photos attached to an order
 */
export const deleteAllPhotos = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updatedOrder = await orderService.deleteAllPhotosFromOrder(id);
  if (!updatedOrder) {
    throw ApiError.notFound('Order not found');
  }
  return ApiResponse.success(res, updatedOrder, 'All photos deleted successfully');
});

/**
 * Stream/Serve photo from Cloudflare R2 (reliable proxy for private R2 buckets)
 */
export const streamPhoto = asyncHandler(async (req, res) => {
  const { key } = req.query;
  if (!key) {
    throw ApiError.badRequest('Photo key is required');
  }

  try {
    const { stream, contentType, contentLength } = await r2Service.getObjectStream(key);
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    stream.pipe(res);
  } catch (error) {
    throw ApiError.notFound('Image could not be retrieved from R2: ' + error.message);
  }
});

