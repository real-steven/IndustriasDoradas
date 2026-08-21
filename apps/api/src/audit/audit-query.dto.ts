import { IsIn, IsOptional } from "class-validator";

import type { AuditResult } from "./audit.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["SUCCEEDED", "REJECTED", "FAILED"])
  result?: AuditResult;
}
