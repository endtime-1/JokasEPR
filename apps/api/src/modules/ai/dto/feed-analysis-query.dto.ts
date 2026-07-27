import { IsUUID } from "class-validator";

export class FeedAnalysisQueryDto {
  @IsUUID()
  batchId!: string;
}
