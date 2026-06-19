import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ScopeAccessGuard } from "./scope-access.guard";
import { REQUIRED_SCOPE_ACCESS_KEY, ScopeAccessRule } from "../decorators/scope-access.decorator";
import { makeAuthUser, makeSuperAdmin, TEST_FARM_ID, TEST_WAREHOUSE_ID } from "../../../../test/factories";
import { AuthenticatedUser } from "@jokas/shared";

function makeContext(user: AuthenticatedUser, body: Record<string, unknown>, rule: ScopeAccessRule | undefined): ExecutionContext {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, "getAllAndOverride")
    .mockImplementation((key) => (key === REQUIRED_SCOPE_ACCESS_KEY ? rule : undefined));

  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, body }),
    }),
    _reflector: reflector,
  } as unknown as ExecutionContext;
}

function makeGuardWithRule(rule: ScopeAccessRule | undefined): { guard: ScopeAccessGuard; reflector: Reflector } {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, "getAllAndOverride")
    .mockImplementation((key) => (key === REQUIRED_SCOPE_ACCESS_KEY ? rule : undefined));
  return { guard: new ScopeAccessGuard(reflector), reflector };
}

function makeCtx(user: AuthenticatedUser, body: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, body }),
    }),
  } as unknown as ExecutionContext;
}

describe("ScopeAccessGuard", () => {
  it("allows access when no scope rule is configured", () => {
    const { guard } = makeGuardWithRule(undefined);
    const ctx = makeCtx(makeAuthUser(), { farmId: TEST_FARM_ID });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("allows access for Super Admin regardless of scope", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const admin = makeSuperAdmin();
    const ctx = makeCtx(admin, { farmId: "completely-different-farm" });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("allows access when user's farmId matches the request body", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID] });
    const ctx = makeCtx(user, { farmId: TEST_FARM_ID });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when user does not have access to the farm", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const user = makeAuthUser({ farmIds: ["allowed-farm-id"] });
    const ctx = makeCtx(user, { farmId: "forbidden-farm-id" });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("allows access when farmId field is not in the body (DTO handles required validation)", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID] });
    const ctx = makeCtx(user, {}); // no farmId in body

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when farmId is an empty string (type-confusion bypass)", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID] });
    const ctx = makeCtx(user, { farmId: "" });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when farmId is a number (type-confusion bypass)", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID] });
    const ctx = makeCtx(user, { farmId: 12345 });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("enforces warehouseId restriction", () => {
    const { guard } = makeGuardWithRule({ warehouseId: "warehouseId" });
    const user = makeAuthUser({ warehouseIds: [TEST_WAREHOUSE_ID] });

    expect(guard.canActivate(makeCtx(user, { warehouseId: TEST_WAREHOUSE_ID }))).toBe(true);
    expect(() => guard.canActivate(makeCtx(user, { warehouseId: "different-warehouse" }))).toThrow(ForbiddenException);
  });

  it("enforces both farmId and warehouseId simultaneously", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId", warehouseId: "warehouseId" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID], warehouseIds: [TEST_WAREHOUSE_ID] });

    // Both valid
    expect(
      guard.canActivate(makeCtx(user, { farmId: TEST_FARM_ID, warehouseId: TEST_WAREHOUSE_ID }))
    ).toBe(true);

    // Farm valid, warehouse invalid
    expect(() =>
      guard.canActivate(makeCtx(user, { farmId: TEST_FARM_ID, warehouseId: "bad-warehouse" }))
    ).toThrow(ForbiddenException);

    // Warehouse valid, farm invalid
    expect(() =>
      guard.canActivate(makeCtx(user, { farmId: "bad-farm", warehouseId: TEST_WAREHOUSE_ID }))
    ).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when authenticated user context is missing", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId" });
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined, body: { farmId: TEST_FARM_ID } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("reads scope from query source when configured", () => {
    const { guard } = makeGuardWithRule({ farmId: "farmId", source: "query" });
    const user = makeAuthUser({ farmIds: [TEST_FARM_ID] });
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user, body: {}, query: { farmId: TEST_FARM_ID } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
