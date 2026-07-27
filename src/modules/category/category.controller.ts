import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { categoryService } from './category.service';

const list = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await categoryService.list();
  sendSuccess(res, categories);
});

const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getBySlug(req.params.slug);
  sendSuccess(res, category);
});

export const categoryController = { list, getBySlug };
