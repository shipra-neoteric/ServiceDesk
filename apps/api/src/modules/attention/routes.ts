import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { computeAttentionItems } from './rules.js';

export const attentionRouter = Router();
attentionRouter.use(requireAuth);

attentionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await computeAttentionItems(req.access!);
    res.json({ items, total: items.length });
  }),
);
