// Reusable upload pipeline: multipart -> disk (server/uploads/...) -> size + magic-byte verification. Never Base64.
import fs from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import { multerInstance, kindOf, KINDS } from '../config/multer.js';
const cleanup = (files) => Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
async function verify(req, res, next) {
  const files = req.files || [];
  try {
    for (const f of files) {
      const kind = kindOf(f.mimetype, req.allowedKinds);
      if (f.size > KINDS[kind].max) throw Object.assign(new Error(`File is too large (max ${KINDS[kind].max / 1048576} MB)`), { status: 413 });
      const real = await fileTypeFromFile(f.path);
      if (!real || !KINDS[kind].mimes.includes(real.mime)) throw Object.assign(new Error('File content does not match its type'), { status: 415 });
      f.kind = kind;
    }
    next();
  } catch (e) { await cleanup(files); next(e); }
}
export const uploadFiles = (allowedKinds) => [(req, _res, next) => { req.allowedKinds = allowedKinds; next(); }, multerInstance.array('files', 5), verify];
