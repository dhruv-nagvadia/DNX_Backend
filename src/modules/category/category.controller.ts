import { Category } from '@prisma/client';
import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { absoluteAsset } from '@/utils/assetUrl';
import { categoryService } from './category.service';

/** Makes every stored asset path on a category (and its sub-categories) absolute. */
function withAbsoluteAssets<
  T extends Pick<Category, 'iconUrl' | 'imageUrl' | 'bannerUrl'> & {
    subcategories?: { imageUrl: string | null }[];
  },
>(req: Request, category: T): T {
  return {
    ...category,
    iconUrl: absoluteAsset(req, category.iconUrl) ?? null,
    imageUrl: absoluteAsset(req, category.imageUrl) ?? null,
    bannerUrl: absoluteAsset(req, category.bannerUrl) ?? null,
    ...(category.subcategories
      ? {
          subcategories: category.subcategories.map((s) => ({
            ...s,
            imageUrl: absoluteAsset(req, s.imageUrl) ?? null,
          })),
        }
      : {}),
  };
}

const list = asyncHandler(async (req: Request, res: Response) => {
  const categories = await categoryService.list();
  sendSuccess(res, categories.map((c) => withAbsoluteAssets(req, c)));
});

const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoryService.getBySlug(req.params.slug);
  sendSuccess(res, withAbsoluteAssets(req, category));
});

export const categoryController = { list, getBySlug };
