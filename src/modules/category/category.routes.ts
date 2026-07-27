import { Router } from 'express';
import { categoryController } from './category.controller';

export const categoryRoutes = Router();

// Public: users browse categories (medical, salon, ...) on the home screen.
categoryRoutes.get('/', categoryController.list);
categoryRoutes.get('/:slug', categoryController.getBySlug);
