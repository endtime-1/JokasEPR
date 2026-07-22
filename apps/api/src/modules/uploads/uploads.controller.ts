import { Controller, Get, NotFoundException, Param, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { join, resolve } from "path";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

const ALLOWED_TYPES = new Set(["employees", "products"]);
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;

@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  private readonly uploadsDir = join(process.cwd(), "uploads");

  @Get(":type/:filename")
  serveFile(
    @Param("type") type: string,
    @Param("filename") filename: string,
    @Res() res: Response
  ) {
    if (!ALLOWED_TYPES.has(type)) throw new NotFoundException();
    if (!SAFE_FILENAME_RE.test(filename)) throw new NotFoundException();

    const resolved = resolve(this.uploadsDir, type, filename);
    // Path traversal guard: resolved path must stay inside uploadsDir
    if (!resolved.startsWith(resolve(this.uploadsDir))) throw new NotFoundException();

    res.sendFile(resolved, (err) => {
      if (err) throw new NotFoundException("File not found.");
    });
  }
}
