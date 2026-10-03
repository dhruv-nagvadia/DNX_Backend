import { Category } from '@prisma/client';
import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { categoryService } from './category.service';

/** DB stores iconUrl as a relative path (e.g. "/assets/categories/grocery.png")
 * so it stays portable across environments — made absolute here, the same way
 * uploaded image URLs are built in provider.controller.ts. */
function withAbsoluteIcon<T extends Pick<Category, 'iconUrl'>>(req: Request, category: T): T {
  if (!category.iconUrl || /^https?:\/\//.test(category.iconUrl)) return category;
  const origin = `${req.protocol}://${req.get('host')}`;
  return { ...category, iconUrl: `${origin}${category.iconUrl}` };
}

const list = asyncHandler(async (req: Request, res: Response) => {
  const categories = await categoryService.list();
  sendSuccess(res, categories.map((c) => withAbsoluteIcon(req, c)));
});

const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getBySlug(req.params.slug);
  sendSuccess(res, withAbsoluteIcon(req, category));
});

export const categoryController = { list, getBySlug };
