import { Controller, Get, NotFoundException, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;
const SAFE_DOC_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|pdf)$/i;

@Controller("uploads")
export class UploadsController {
  private readonly uploadsDir = join(process.cwd(), "uploads");

  constructor(private readonly prisma: PrismaService) {}

  // Product images are public — the storefront fetches them without auth
  @Public()
  @Get("products/:filename")
  serveProductFile(@Param("filename") filename: string, @Res() res: Response) {
    this.send(res, "products", filename);
  }

  // Employee photos contain personal data. A valid session alone isn't
  // enough — without checking that the photo actually belongs to an
  // employee in the requester's own company, any authenticated user of ANY
  // company could fetch another company's employee photos by filename
  // (filenames are timestamp + short random suffix, not company-scoped).
  @UseGuards(JwtAuthGuard)
  @Get("employees/:filename")
  async serveEmployeeFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("filename") filename: string,
    @Res() res: Response
  ) {
    if (!SAFE_FILENAME_RE.test(filename)) throw new NotFoundException();
    const owned = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, deletedAt: null, photoUrl: `/api/v1/uploads/employees/${filename}` },
      select: { id: true }
    });
    if (!owned) throw new NotFoundException("File not found.");
    this.send(res, "employees", filename);
  }

  // Employee documents (national ID scans, contracts, etc.) — same
  // tenant-ownership check as serveEmployeeFile above.
  @UseGuards(JwtAuthGuard)
  @Get("documents/:filename")
  async serveDocumentFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("filename") filename: string,
    @Res() res: Response
  ) {
    if (!SAFE_DOC_FILENAME_RE.test(filename)) throw new NotFoundException();
    const owned = await this.prisma.employeeDocument.findFirst({
      where: { companyId: user.companyId, deletedAt: null, fileUrl: `/api/v1/uploads/documents/${filename}` },
      select: { id: true }
    });
    if (!owned) throw new NotFoundException("File not found.");

    const resolved = resolve(this.uploadsDir, "documents", filename);
    if (!resolved.startsWith(resolve(this.uploadsDir))) throw new NotFoundException();
    if (!existsSync(resolved)) throw new NotFoundException("File not found.");
    res.sendFile(resolved, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  }

  private send(res: Response, type: string, filename: string) {
    if (!SAFE_FILENAME_RE.test(filename)) throw new NotFoundException();

    const resolved = resolve(this.uploadsDir, type, filename);
    if (!resolved.startsWith(resolve(this.uploadsDir))) throw new NotFoundException();
    if (!existsSync(resolved)) throw new NotFoundException("File not found.");

    res.sendFile(resolved, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  }
}
