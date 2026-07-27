import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { mkdirSync } from "fs";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { StorefrontBrowseRateLimitGuard, StorefrontOrderRateLimitGuard } from "../../common/guards/storefront-rate-limit.guard";
import { validateAndCleanImageUpload } from "../../common/utils/validate-image-magic";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { UpdatePublicProductDto } from "./dto/update-public-product.dto";
import { PublicService } from "./public.service";

const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function resolveImageExt(file: Express.Multer.File): string {
  const ext = extname(file.originalname).toLowerCase();
  return ALLOWED_IMAGE_EXTS.has(ext) ? ext : ".jpg";
}

@Controller("public")
export class PublicController {
  constructor(private readonly service: PublicService) {}

  /* ── Public storefront endpoints (no auth — rate-limited by IP) ── */

  @UseGuards(StorefrontBrowseRateLimitGuard)
  @Get("products")
  products(@Query("category") category?: string) {
    return this.service.listProducts(category).then((data) => ({ data }));
  }

  @UseGuards(StorefrontBrowseRateLimitGuard)
  @Get("products/:slug")
  product(@Param("slug") slug: string) {
    return this.service.getProduct(slug).then((data) => ({ data }));
  }

  @UseGuards(StorefrontOrderRateLimitGuard)
  @Post("orders")
  placeOrder(@Body() dto: PlacePublicOrderDto) {
    return this.service.placeOrder(dto).then((data) => ({ data }));
  }

  @UseGuards(StorefrontBrowseRateLimitGuard)
  @Get("orders/:ref")
  orderStatus(@Param("ref") ref: string) {
    return this.service.getOrderStatus(ref).then((data) => ({ data }));
  }

  /* ── Storefront admin endpoints (JWT + SALES_MANAGE required) ─── */

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/products")
  adminProducts(@CurrentUser() user: AuthenticatedUser, @Query("search") search?: string) {
    return this.service.adminListProducts(user.companyId, search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/products/:id")
  adminUpdateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdatePublicProductDto,
  ) {
    return this.service.adminUpdateProduct(user.companyId, id, dto).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/orders")
  adminOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.service.adminListOrders(user.companyId, status, search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/orders/:id/status")
  adminUpdateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("status") status: string,
  ) {
    return this.service.adminUpdateOrderStatus(user.companyId, id, status).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/stats")
  adminStats(@CurrentUser() user: AuthenticatedUser) {
    return this.service.adminStats(user.companyId).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), "uploads", "products");
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = resolveImageExt(file);
          cb(null, `prod-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) cb(null, true);
        else cb(new BadRequestException("Only image files are allowed"), false);
      },
    })
  )
  @Post("admin/products/:id/image")
  async adminUploadProductImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!validateAndCleanImageUpload(file.path)) {
      throw new BadRequestException("Invalid image file. Upload a JPEG, PNG, WebP, or GIF.");
    }
    const imageUrl = await this.service.updateProductImageUrl(user.companyId, id, file.filename);
    return { data: { imageUrl } };
  }
}
