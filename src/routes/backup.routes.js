import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import {
  getStats,
  downloadBackupJson,
  downloadBackupSql,
  listBackups,
  downloadServerBackup,
  restoreFromUploadedFile,
  restoreFromServer,
  triggerManualBackup,
  getGoogleDriveSettings,
  saveGoogleDriveSettings,
  testGoogleDriveUpload,
} from '../controllers/backup.controller.js';
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// Configure multer for safe backup file uploads
const uploadBackup = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1,
  },
});

/**
 * ====================================================================
 * 👑 All Backup & Restore Routes Are Strictly Restricted to Admin
 * ====================================================================
 */
router.use('/backup', verifyToken, authorizeRoles('admin'));

router.get('/backup/stats', getStats);
router.get('/backup/download-json', downloadBackupJson);
router.get('/backup/download-sql', downloadBackupSql);
router.get('/backup/list', listBackups);
router.get('/backup/server-file/:filename', downloadServerBackup);
router.post('/backup/manual-now', triggerManualBackup);
router.post('/backup/restore-file', uploadBackup.single('backupFile'), restoreFromUploadedFile);
router.post('/backup/restore-server', restoreFromServer);
router.get('/backup/google-drive-settings', getGoogleDriveSettings);
router.post('/backup/google-drive-settings', saveGoogleDriveSettings);
router.post('/backup/google-drive-test', testGoogleDriveUpload);

export default router;

