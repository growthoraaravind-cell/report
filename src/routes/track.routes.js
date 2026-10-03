import { Router } from 'express';
import { track, trackSchema } from '../controllers/track.controller.js';
import { validate } from '../middlewares/validate.js';
const r = Router(); r.post('/', validate(trackSchema), track); export default r;
