# DNX Backend — AI Life Services Platform

Node.js + Express + TypeScript + Prisma + PostgreSQL.

## Architecture

Feature-based **modular monolith**. Each domain lives in its own folder under
`src/modules/<domain>/` and exposes 5 predictable files:

| File | Responsibility |
|---|---|
| `<domain>.routes.ts` | Wires URLs → middleware → controller |
| `<domain>.controller.ts` | Thin: reads input, calls service, sends response |
| `<domain>.service.ts` | **All business logic** + DB access via Prisma |
| `<domain>.validation.ts` | Zod schemas for body/query/params |
| `<domain>.types.ts` | Input/output TypeScript types |

Shared plumbing lives outside modules:

```
src/
├── config/         # env.ts — zod-validated environment (fails fast at boot)
├── lib/            # prisma.ts — Prisma client singleton
├── middlewares/    # errorHandler, notFound, validate, auth
├── utils/          # ApiError, ApiResponse, asyncHandler, logger
├── routes/         # index.ts — mounts every module under /api/v1
├── modules/        # auth, category, provider, booking (feature domains)
├── app.ts          # Express app (security, parsing, routes, error handling)
└── server.ts       # Entry point (DB connect + graceful shutdown)
```

## Coding standards

- **TypeScript strict mode** everywhere; `@/` path alias → `src/`.
- **Never** put business logic in controllers — it goes in the service.
- **Never** read `process.env` directly — import from `@/config`.
- Throw `ApiError.badRequest(...)` etc.; the global handler formats the response.
- Every response uses the envelope `{ success, message, data }`.
- Prices stored as integer minor units (paise/cents) — never floats.
- ESLint + Prettier enforced (`npm run lint`, `npm run format`).

## Getting started

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env         # then edit DATABASE_URL + JWT secrets

# 3. Start PostgreSQL (Docker example)
docker run --name dnx-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dnx -p 5432:5432 -d postgres:16

# 4. Create tables + seed categories
npm run prisma:migrate       # creates the initial migration
npm run prisma:seed

# 5. Run the API
npm run dev                  # http://localhost:4000/health
```

## API surface (Phase 1)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | Register user or provider |
| POST | `/api/v1/auth/login` | – | Login → access + refresh tokens |
| POST | `/api/v1/auth/refresh` | – | Rotate access token |
| GET | `/api/v1/auth/me` | ✅ | Current user |
| GET | `/api/v1/categories` | – | List service categories |
| GET | `/api/v1/providers` | – | Search/list providers (filters + pagination) |
| GET | `/api/v1/providers/:id` | – | Provider detail + services |
| POST | `/api/v1/providers` | ✅ provider | Create provider profile |
| GET | `/api/v1/bookings/mine` | ✅ | (scaffold) User bookings |

## Roadmap

- **Phase 1:** auth, categories, provider profiles + services, provider search, bookings.
- **Phase 2:** payments (Razorpay/Stripe), calendar sync, reminders, documents.
- **Later:** AI assistant (Claude API), expense tracking, analytics.
