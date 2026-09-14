import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class EggSalesQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateEggSaleDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  buyerName?: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  // What `quantity` is counted in — the buyer/seller may naturally think in
  // either unit, so this converts to canonical pieces + crates server-side
  // rather than forcing one unit on the form.
  @IsEnum(["PIECES", "CRATES"])
  unit!: "PIECES" | "CRATES";

  @IsNumber()
  @Min(0)
  unitPriceCrate!: number;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  // Owner feedback (2026-09-14): a manually-typed sale had no way to see or
  // set its own number — it was silently auto-generated (ES-<year>-NNNN)
  // after the fact, unlike the bulk import which carried real QuickBooks
  // invoice numbers through as ES-BOOK1-<invoice#>. Optional: leave blank to
  // keep auto-generating, or set one to continue an existing paper-trail
  // sequence (e.g. picking up numbering where the imported invoices left off).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  saleNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
