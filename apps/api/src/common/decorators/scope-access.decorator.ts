import { SetMetadata } from "@nestjs/common";

export const REQUIRED_SCOPE_ACCESS_KEY = "requiredScopeAccess";

export type ScopeAccessSource = "body" | "query" | "params";

export type ScopeAccessRule = {
  source?: ScopeAccessSource;
  branchId?: string;
  farmId?: string;
  warehouseId?: string;
  productionSiteId?: string;
};

export const RequireScopeAccess = (rule: ScopeAccessRule) => SetMetadata(REQUIRED_SCOPE_ACCESS_KEY, rule);
