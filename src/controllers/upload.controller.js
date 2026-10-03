import FileAsset from '../models/FileAsset.js';
import { ok, fail, wrap } from '../utils/apiResponse.js';
import { KINDS } from '../config/multer.js';
export const saveUploads = wrap(async (req, res) => {
  if (!req.files?.length) return fail(res, 400, 'Please choose a file to upload');
  const docs = await FileAsset.insertMany(req.files.map((f) => ({ url: `/uploads/${KINDS[f.kind].dir}/${f.filename}`, path: f.path, originalName: f.originalname, mimeType: f.mimetype, size: f.size, kind: f.kind, ownerType: req.admin ? 'admin' : 'visitor' })));
  res.status(201); ok(res, docs.map((d) => ({ id: d._id, url: d.url, originalName: d.originalName, mimeType: d.mimeType, size: d.size, kind: d.kind, uploadedAt: d.uploadedAt })), 'Upload complete');
});
