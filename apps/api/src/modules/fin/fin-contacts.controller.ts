import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { AddTaxRateDto, ContactQueryDto, CreateContactDto, CreateTaxCodeDto, ImportCsvDto, UpdateContactDto, UpdateTaxCodeDto } from "./dto/fin.dto";
import { FinContactsService } from "./fin-contacts.service";
import { FinTaxService } from "./fin-tax.service";

/** Finance v2 contacts (customers and suppliers). Own tables; not the ERP's customer or supplier lists. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/contacts")
export class FinContactsController {
  constructor(private readonly contacts: FinContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_VIEW)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ContactQueryDto) {
    const { rows, total, page, take } = await this.contacts.list(user.companyId, query);
    return { data: rows, meta: { total, page, take } };
  }

  // Fixed paths first, so they are never mistaken for an :id.
  @Get("import/template")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_VIEW)
  template() {
    return { data: { csv: this.contacts.template() } };
  }

  @Get("export")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_IMPORT)
  async export(@CurrentUser() user: AuthenticatedUser) {
    return { data: { csv: await this.contacts.exportCsv(user.companyId) } };
  }

  @Post("import/preview")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_IMPORT)
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCsvDto) {
    return { data: await this.contacts.previewImport(user.companyId, dto.csv) };
  }

  @Post("import/commit")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_IMPORT)
  async commit(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportCsvDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.contacts.commitImport(user.companyId, user.id, dto.csv, dto.fileName, { ipAddress, userAgent }) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_VIEW)
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.contacts.get(user.companyId, id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_CREATE)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.contacts.create(user.companyId, user.id, dto, { ipAddress, userAgent }) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.FIN_CONTACTS_CREATE)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return { data: await this.contacts.update(user.companyId, user.id, id, dto, { ipAddress, userAgent }) };
  }
}

/** Tax codes and their dated rates. Viewing needs fin.settings.view, changing needs fin.settings.settings. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/tax-codes")
export class FinTaxController {
  constructor(private readonly tax: FinTaxService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_VIEW)
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.tax.list(user.companyId) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_SETTINGS)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaxCodeDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    await this.tax.create(user.companyId, user.id, dto, { ipAddress, userAgent });
    return { data: await this.tax.list(user.companyId) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_SETTINGS)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    await this.tax.update(user.companyId, user.id, id, dto, { ipAddress, userAgent });
    return { data: await this.tax.list(user.companyId) };
  }

  @Post(":id/rates")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_SETTINGS)
  async addRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddTaxRateDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    await this.tax.addRate(user.companyId, user.id, id, dto, { ipAddress, userAgent });
    return { data: await this.tax.list(user.companyId) };
  }
}
