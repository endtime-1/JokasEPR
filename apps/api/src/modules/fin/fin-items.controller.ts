import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { AdjustStockDto, CreateItemDto, ImportItemsDto, ItemListQueryDto, MovementQueryDto, UpdateItemDto, ValuationQueryDto } from "./dto/fin-items.dto";
import { FinItemsService } from "./fin-items.service";

const P = PERMISSIONS;

/** Finance v2 items and stock. Own tables (fin_items, fin_stock_movements); not the ERP's products or inventory. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/items")
export class FinItemsController {
  constructor(private readonly items: FinItemsService) {}

  @Get() @RequirePermissions(P.FIN_ITEMS_VIEW)
  async list(@CurrentUser() u: AuthenticatedUser, @Query() q: ItemListQueryDto) {
    const { rows, total, page, take, totals } = await this.items.list(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  // Fixed paths first, so they are never mistaken for an :id.
  @Get("lookup") @RequirePermissions(P.FIN_ITEMS_VIEW)
  async lookup(@CurrentUser() u: AuthenticatedUser, @Query("code") code = "") {
    return { data: await this.items.lookup(u.companyId, code) };
  }

  @Get("movements") @RequirePermissions(P.FIN_ITEMS_VIEW)
  async movements(@CurrentUser() u: AuthenticatedUser, @Query() q: MovementQueryDto) {
    const { rows, total, page, take } = await this.items.movements(u.companyId, q);
    return { data: rows, meta: { total, page, take } };
  }

  @Get("valuation") @RequirePermissions(P.FIN_ITEMS_VIEW)
  async valuation(@CurrentUser() u: AuthenticatedUser, @Query() q: ValuationQueryDto) {
    return { data: await this.items.valuation(u.companyId, q) };
  }

  @Get("import/template") @RequirePermissions(P.FIN_ITEMS_IMPORT)
  template() {
    return { data: { csv: this.items.templateCsv() } };
  }

  @Get("export") @RequirePermissions(P.FIN_ITEMS_VIEW)
  async exportCsv(@CurrentUser() u: AuthenticatedUser) {
    return { data: { csv: await this.items.exportCsv(u.companyId) } };
  }

  @Post("import/preview") @RequirePermissions(P.FIN_ITEMS_IMPORT)
  async preview(@CurrentUser() u: AuthenticatedUser, @Body() dto: ImportItemsDto) {
    return { data: await this.items.previewImport(u.companyId, dto) };
  }

  @Post("import") @RequirePermissions(P.FIN_ITEMS_IMPORT)
  async commit(@CurrentUser() u: AuthenticatedUser, @Body() dto: ImportItemsDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.items.commitImport(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("adjust") @RequirePermissions(P.FIN_ITEMS_POST)
  async adjust(@CurrentUser() u: AuthenticatedUser, @Body() dto: AdjustStockDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.items.adjust(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post() @RequirePermissions(P.FIN_ITEMS_CREATE)
  async create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateItemDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.items.create(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Get(":id") @RequirePermissions(P.FIN_ITEMS_VIEW)
  async get(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.items.get(u.companyId, id) };
  }

  @Patch(":id") @RequirePermissions(P.FIN_ITEMS_CREATE)
  async update(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.items.update(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }
}
