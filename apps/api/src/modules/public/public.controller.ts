import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { PERMISSIONS } from "@jokas/shared";
import { diskStorage } from "multer";
import { join } from "path";
import { mkdirSync } from "fs";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { validateAndCleanImageUpload } from "../../common/utils/validate-image-magic";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { PublicService } from "./public.service";

@Controller("public")
export class PublicController {
  constructor(private readonly service: PublicService) {}

  /* ── Public storefront endpoints (no auth) ────────────────────────── */

  @Get("products")
  products(@Query("category") category?: string) {
    return this.service.listProducts(category).then((data) => ({ data }));
  }

  @Get("products/:slug")
  product(@Param("slug") slug: string) {
    return this.service.getProduct(slug).then((data) => ({ data }));
  }

  @Post("orders")
  placeOrder(@Body() dto: PlacePublicOrderDto) {
    return this.service.placeOrder(dto).then((data) => ({ data }));
  }

  @Get("orders/:ref")
  orderStatus(@Param("ref") ref: string) {
    return this.service.getOrderStatus(ref).then((data) => ({ data }));
  }

  /* ── Storefront admin endpoints (JWT + SALES_MANAGE required) ────── */

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/products")
  adminProducts(@Query("search") search?: string) {
    return this.service.adminListProducts(search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/products/:id")
  adminUpdateProduct(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.service.adminUpdateProduct(id, body).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/orders")
  adminOrders(@Query("status") status?: string, @Query("search") search?: string) {
    return this.service.adminListOrders(status, search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/orders/:id/status")
  adminUpdateOrderStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.service.adminUpdateOrderStatus(id, status).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/stats")
  adminStats() {
    return this.service.adminStats().then((data) => ({ data }));
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
        filename: (_req, _file, cb) => {
          cb(null, `prod-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
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
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!validateAndCleanImageUpload(file.path)) {
      throw new BadRequestException("Invalid image file. Upload a JPEG, PNG, WebP, or GIF.");
    }
    const imageUrl = await this.service.updateProductImageUrl(id, file.filename);
    return { data: { imageUrl } };
  }
}
