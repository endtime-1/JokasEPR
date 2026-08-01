import { Controller, Get, NotFoundException, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;
const SAFE_DOC_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif|pdf)$/i;

@Controller("uploads")
export class UploadsController {
  private readonly uploadsDir = join(process.cwd(), "uploads");

  // Product images are public — the storefront fetches them without auth
  @Get("products/:filename")
  serveProductFile(@Param("filename") filename: string, @Res() res: Response) {
    this.send(res, "products", filename);
  }

  // Employee photos contain personal data — require a valid session
  @UseGuards(JwtAuthGuard)
  @Get("employees/:filename")
  serveEmployeeFile(@Param("filename") filename: string, @Res() res: Response) {
    this.send(res, "employees", filename);
  }

  // Employee documents (images + PDFs) — require a valid session
  @UseGuards(JwtAuthGuard)
  @Get("documents/:filename")
  serveDocumentFile(@Param("filename") filename: string, @Res() res: Response) {
    if (!SAFE_DOC_FILENAME_RE.test(filename)) throw new NotFoundException();
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
