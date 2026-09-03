import { SetMetadata } from "@nestjs/common";

/**
 * Marks a route (or a whole controller) as reachable without a valid session.
 *
 * The global JwtAuthGuard (registered as an APP_GUARD in AppModule) authenticates
 * every request by default — a controller that simply omits `@UseGuards` is NOT
 * public, it is broken. Opting a route out of authentication has to be a
 * deliberate, greppable choice: the storefront browse/order/contact endpoints,
 * the first-run setup endpoint, and the public product-image route.
 */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
