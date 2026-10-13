import { userService } from '../services/user.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getUsers = asyncHandler(async (req, res) => {
  const users = await userService.getUsers();
  return ApiResponse.success(res, users, 'Users retrieved successfully');
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  return ApiResponse.success(res, user, 'User details retrieved');
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  return ApiResponse.created(res, user, 'New user created successfully');
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  return ApiResponse.success(res, user, 'User updated successfully');
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await userService.toggleUserStatus(req.params.id, req.user.id);
  return ApiResponse.success(res, user, `User is now ${user.is_active ? 'active' : 'suspended'}`);
});

export const deleteUser = asyncHandler(async (req, res) => {
  const result = await userService.deleteUser(req.params.id, req.user.id);
  return ApiResponse.success(res, result, result.message);
});

export default {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
};
