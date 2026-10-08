import multer from 'multer';

// Memory storage keeps file in memory buffer so we can send directly to Cloudflare R2
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, etc.) are allowed!'), false);
  }
};

export const uploadOrderPhotos = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max per photo
    files: 10, // Up to 10 photos at once
  },
  fileFilter,
});

export const uploadWorkerAadhar = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB max
    files: 1,
  },
  fileFilter,
});

export default uploadOrderPhotos;

