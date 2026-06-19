export type ApiSuccess<T> = {
  success?: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  success: false;
  statusCode: number;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId?: string;
};

export type PaginationQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
