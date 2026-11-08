import fs from 'fs';
import path from 'path';
import {
  getDatabaseStats,
  createFullBackupData,
  generateSqlDump,
  restoreBackupFromJson,
  listServerBackups,
  runDailyAutoBackup,
  restoreFromServerBackupFile,
  getGoogleDriveSettings as getDriveSettingsService,
  saveGoogleDriveSettings as saveDriveSettingsService,
  uploadBackupToGoogleDrive,
} from '../services/backup.service.js';

/**
 * ====================================================================
 * 🛡️ Database Backup Controller (Strictly Admin Authorized)
 * ====================================================================
 */

/**
 * GET /api/backup/stats
 * Get live database statistics
 */
export async function getStats(req, res) {
  try {
    const stats = await getDatabaseStats();
    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching backup stats:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch database statistics',
    });
  }
}

/**
 * GET /api/backup/download-json
 * Downloads single complete JSON backup
 */
export async function downloadBackupJson(req, res) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `faizanbody_backup_${todayStr}_${Date.now()}.json`;

    const backupData = await createFullBackupData();
    const jsonStr = JSON.stringify(backupData, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(jsonStr);
  } catch (error) {
    console.error('Error downloading backup JSON:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate backup JSON',
    });
  }
}

/**
 * GET /api/backup/download-sql
 * Downloads single complete SQL dump
 */
export async function downloadBackupSql(req, res) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `faizanbody_backup_${todayStr}_${Date.now()}.sql`;

    const sqlStr = await generateSqlDump();

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(sqlStr);
  } catch (error) {
    console.error('Error downloading backup SQL:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate backup SQL',
    });
  }
}

/**
 * GET /api/backup/list
 * List rolling 30-day backups on server
 */
export async function listBackups(req, res) {
  try {
    const backups = listServerBackups();
    return res.json({
      success: true,
      data: backups,
    });
  } catch (error) {
    console.error('Error listing server backups:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to list server backups',
    });
  }
}

/**
 * GET /api/backup/server-file/:filename
 * Download a specific rolling server backup file
 */
export async function downloadServerBackup(req, res) {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), 'backups', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found',
      });
    }

    const isJson = safeFilename.endsWith('.json');
    res.setHeader('Content-Type', isJson ? 'application/json' : 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  } catch (error) {
    console.error('Error downloading server backup file:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to download server backup file',
    });
  }
}

/**
 * POST /api/backup/restore-file
 * Restores entire database from uploaded single backup file
 */
export async function restoreFromUploadedFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No backup file uploaded. Please upload a .json backup file.',
      });
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf8');

    // Clean up temporary upload file immediately
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}

    let parsed;
    try {
      parsed = JSON.parse(fileContent);
    } catch (jsonErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON file. Please ensure the backup file is intact and valid.',
      });
    }

    const result = await restoreBackupFromJson(parsed);
    return res.json(result);
  } catch (error) {
    console.error('Error restoring database from uploaded file:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore database from uploaded backup',
    });
  }
}

/**
 * POST /api/backup/restore-server
 * Restores database from a rolling server backup file
 */
export async function restoreFromServer(req, res) {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required for restore.',
      });
    }

    const result = await restoreFromServerBackupFile(filename);
    return res.json(result);
  } catch (error) {
    console.error('Error restoring database from server file:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore database from server backup',
    });
  }
}

/**
 * POST /api/backup/manual-now
 * Trigger a manual snapshot right now
 */
export async function triggerManualBackup(req, res) {
  try {
    const result = await runDailyAutoBackup();
    return res.json({
      success: true,
      message: 'Manual backup point created successfully.',
      data: result,
    });
  } catch (error) {
    console.error('Error triggering manual backup:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create manual backup',
    });
  }
}

/**
 * GET /api/backup/google-drive-settings
 * Retrieve Google Drive auto backup config
 */
export async function getGoogleDriveSettings(req, res) {
  try {
    const settings = await getDriveSettingsService();
    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching Google Drive settings:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch Google Drive settings',
    });
  }
}

/**
 * POST /api/backup/google-drive-settings
 * Save/update Google Drive auto backup config
 */
export async function saveGoogleDriveSettings(req, res) {
  try {
    const updated = await saveDriveSettingsService(req.body);
    return res.json({
      success: true,
      message: 'Google Drive settings updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating Google Drive settings:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update Google Drive settings',
    });
  }
}

/**
 * POST /api/backup/google-drive-test
 * Trigger immediate test upload to connected Google Drive account
 */
export async function testGoogleDriveUpload(req, res) {
  try {
    const result = await uploadBackupToGoogleDrive();
    return res.json({
      success: true,
      message: result.message || 'Test backup successfully sent to Google Drive',
      data: result,
    });
  } catch (error) {
    console.error('Error testing Google Drive upload:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload test backup to Google Drive',
    });
  }
}

