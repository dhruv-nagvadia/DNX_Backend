import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import {
  commissionService,
  GroupBy,
  TransactionQuery,
} from '@/modules/commission/commission.service';

const overview = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, groupBy } = req.query as { from?: string; to?: string; groupBy?: GroupBy };
  const data = await commissionService.adminOverview({ from, to }, groupBy ?? 'day');
  sendSuccess(res, data);
});

/** Turns the validated query string into the ledger filter (dates become the "placed" range). */
function toFilter(q: Record<string, unknown>): TransactionQuery {
  const { from, to, businessId, serviceId, ownerId, method, kind, status, search, page, limit } =
    q as {
      from?: string;
      to?: string;
      businessId?: string;
      serviceId?: string;
      ownerId?: string;
      method?: TransactionQuery['method'];
      kind?: TransactionQuery['kind'];
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    };
  return {
    placed: from || to ? { from, to } : undefined,
    businessId,
    serviceId,
    ownerId,
    method,
    kind,
    status,
    search,
    page,
    limit,
  };
}

const transactions = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await commissionService.adminTransactions(toFilter(req.query)));
});

const breakdown = asyncHandler(async (req: Request, res: Response) => {
  const { by } = req.query as { by?: 'business' | 'service' };
  sendSuccess(res, await commissionService.adminBreakdown(by ?? 'business', toFilter(req.query)));
});

const services = asyncHandler(async (req: Request, res: Response) => {
  const { businessId } = req.query as { businessId?: string };
  sendSuccess(res, await commissionService.adminServices(businessId));
});

const balances = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await commissionService.adminBalances());
});

const businesses = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  sendSuccess(res, await commissionService.adminBusinesses(search?.trim() || undefined));
});

const setBusinessCommission = asyncHandler(async (req: Request, res: Response) => {
  const data = await commissionService.setBusinessCommission(
    req.params.businessId,
    req.body.commissionBps,
  );
  sendSuccess(res, data, 'Commission updated');
});

const listPayouts = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  sendSuccess(res, await commissionService.listPayouts(userId));
});

const recordPayout = asyncHandler(async (req: Request, res: Response) => {
  const payout = await commissionService.recordPayout(req.body);
  sendSuccess(res, payout, 'Settlement recorded', 201);
});

const deletePayout = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await commissionService.deletePayout(req.params.payoutId), 'Settlement removed');
});

export const adminFinanceController = {
  overview,
  transactions,
  breakdown,
  services,
  balances,
  businesses,
  setBusinessCommission,
  listPayouts,
  recordPayout,
  deletePayout,
};
