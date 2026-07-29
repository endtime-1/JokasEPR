import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { existsSync } from "fs";
import { join, resolve } from "path";

const ALLOWED_TYPES = new Set(["employees", "products"]);
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;

@Controller("uploads")
export class UploadsController {
  private readonly uploadsDir = join(process.cwd(), "uploads");

  @Get(":type/:filename")
  serveFile(@Param("type") type: string, @Param("filename") filename: string, @Res() res: Response) {
    if (!ALLOWED_TYPES.has(type)) throw new NotFoundException();
    if (!SAFE_FILENAME_RE.test(filename)) throw new NotFoundException();

    const resolved = resolve(this.uploadsDir, type, filename);
    // Path traversal guard: resolved path must stay inside uploadsDir
    if (!resolved.startsWith(resolve(this.uploadsDir))) throw new NotFoundException();

    // Check existence synchronously so the NotFoundException is thrown in the
    // NestJS handler context (not inside a sendFile callback), ensuring the
    // global exception filter returns a proper 404.
    if (!existsSync(resolved)) throw new NotFoundException("File not found.");

    res.sendFile(resolved, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  }
}
