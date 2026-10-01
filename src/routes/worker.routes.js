import { Router } from 'express';
import {
  getWorkers,
  getWorkerById,
  createWorker,
  updateWorker,
  deleteWorker,
} from '../controllers/worker.controller.js';

const router = Router();

router.route('/workers')
  .get(getWorkers)
  .post(createWorker);

router.route('/workers/:id')
  .get(getWorkerById)
  .put(updateWorker)
  .delete(deleteWorker);

export default router;
