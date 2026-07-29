import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { ApiError } from '@/utils/ApiError';

// Ensure the uploads directory exists at boot.
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

/** Multer instance for business image uploads (max 10MB each, any image type). */
export const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept every image format (jpeg, png, webp, gif, bmp, svg, heic, avif, tiff, ...).
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(ApiError.badRequest('Only image files are allowed'));
  },
});
