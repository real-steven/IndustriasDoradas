import { IsISO8601, IsIn, IsOptional } from "class-validator";

import type { AuditResult } from "./audit.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["SUCCEEDED", "REJECTED", "FAILED"])
  result?: AuditResult;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  fromUtc?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  toUtc?: string;

  @IsOptional()
  @IsIn(["include", "exclude"])
  routine: "include" | "exclude" = "include";
}
