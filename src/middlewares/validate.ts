import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Validates request `body`, `query`, and `params` against a zod schema.
 * Parsed (and coerced) values replace the originals so controllers get
 * clean, typed input.
 *
 * Usage:
 *   const schema = z.object({ body: z.object({ email: z.string().email() }) });
 *   router.post('/', validate(schema), controller.create);
 */
export const validate =
  (schema: AnyZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body) req.body = parsed.body;
      // query/params are read-only in Express 5; assign only if present.
      if (parsed.query) Object.assign(req.query, parsed.query);
      if (parsed.params) Object.assign(req.params, parsed.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(err);
      next(err);
    }
  };
