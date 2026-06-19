export type AuthenticatedUser = {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  farmIds: string[];
  warehouseIds: string[];
  productionSiteIds: string[];
  hasGlobalAccess: boolean;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

