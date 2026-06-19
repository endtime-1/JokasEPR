import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { PERMISSIONS } from "@jokas/shared";
import { makeAuthUser } from "../../../../test/factories";

function makeContext(user: unknown, permissions: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(permissions: string[] | undefined) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, "getAllAndOverride")
    .mockImplementation((key) => (key === REQUIRED_PERMISSIONS_KEY ? permissions : undefined));
  return reflector;
}

describe("PermissionsGuard", () => {
  it("allows access when no permissions are required", () => {
    const guard = new PermissionsGuard(makeReflector(undefined));
    const ctx = makeContext(makeAuthUser({ permissions: [] }), undefined);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("allows access when user has all required permissions", () => {
    const guard = new PermissionsGuard(
      makeReflector([PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE])
    );
    const user = makeAuthUser({
      permissions: [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE, PERMISSIONS.SALES_READ],
    });
    const ctx = makeContext(user, [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when a required permission is missing", () => {
    const guard = new PermissionsGuard(
      makeReflector([PERMISSIONS.FINANCE_MANAGE])
    );
    const user = makeAuthUser({ permissions: [PERMISSIONS.POULTRY_READ] });
    const ctx = makeContext(user, [PERMISSIONS.FINANCE_MANAGE]);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when user has some but not all required permissions", () => {
    const guard = new PermissionsGuard(
      makeReflector([PERMISSIONS.POULTRY_READ, PERMISSIONS.FINANCE_MANAGE])
    );
    const user = makeAuthUser({ permissions: [PERMISSIONS.POULTRY_READ] });
    const ctx = makeContext(user, [PERMISSIONS.POULTRY_READ, PERMISSIONS.FINANCE_MANAGE]);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when authenticated user context is missing", () => {
    const guard = new PermissionsGuard(
      makeReflector([PERMISSIONS.POULTRY_READ])
    );
    const ctx = makeContext(undefined, [PERMISSIONS.POULTRY_READ]);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("allows access with empty required array (edge case)", () => {
    const guard = new PermissionsGuard(makeReflector([]));
    const ctx = makeContext(makeAuthUser({ permissions: [] }), []);

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
