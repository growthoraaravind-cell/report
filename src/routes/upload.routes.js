// Admin-only uploader (all kinds incl. video & logos). Public uploader lives in public.routes.js.
import { Router } from 'express';
import { uploadFiles } from '../middlewares/upload.middleware.js';
import { saveUploads } from '../controllers/upload.controller.js';
const r = Router(); r.post('/', ...uploadFiles(['document', 'image', 'video', 'logo']), saveUploads); export default r;
