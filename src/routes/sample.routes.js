import { Router } from 'express';
import { getWelcome, getItems } from '../controllers/sample.controller.js';

const router = Router();

router.get('/welcome', getWelcome);
router.get('/items', getItems);

export default router;
