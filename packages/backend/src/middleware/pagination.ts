import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export const getPaginationParams = (req: Request): PaginationParams => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const paginatedResponse = (rows: unknown[], total: number, params: PaginationParams) => ({
  data: rows,
  total,
  page: params.page,
  limit: params.limit,
  totalPages: Math.ceil(total / params.limit),
});