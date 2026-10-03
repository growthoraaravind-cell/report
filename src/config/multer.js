import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
export const UPLOAD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const MB = 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const KINDS = {
  document: { dir: 'documents', mimes: ['application/pdf', DOCX], max: 10 * MB },
  image: { dir: 'images', mimes: ['image/jpeg', 'image/png', 'image/webp'], max: 10 * MB },
  video: { dir: 'videos', mimes: ['video/mp4', 'video/webm'], max: 100 * MB },
  logo: { dir: 'logos', mimes: ['image/png', 'image/jpeg', 'image/webp'], max: 5 * MB },
  misc: { dir: 'misc', mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], max: 10 * MB },
  schemeImport: { dir: path.join('documents', 'imports'), mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], max: 10 * MB },
};
export const kindOf = (mime, allowed) => allowed.find((k) => KINDS[k].mimes.includes(mime));
export const safeName = (n) => path.basename(n).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';
const storage = multer.diskStorage({
  destination: (req, file, cb) => { const d = path.join(UPLOAD_ROOT, KINDS[kindOf(file.mimetype, req.allowedKinds)].dir); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`),
});
export const multerInstance = multer({
  storage, limits: { fileSize: 100 * MB, files: 5 },
  fileFilter: (req, file, cb) => (kindOf(file.mimetype, req.allowedKinds) ? cb(null, true) : cb(Object.assign(new Error('This file type is not supported'), { status: 415 }))),
});
