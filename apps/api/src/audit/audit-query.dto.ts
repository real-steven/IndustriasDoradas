import {
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

import type { AuditCategory, AuditResult } from "./audit.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["operation", "people", "administration"])
  category?: AuditCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9_.]*$/u)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9_]*$/u)
  entityType?: string;

  @IsOptional()
  @IsIn(["SUCCEEDED", "REJECTED", "FAILED"])
  result?: AuditResult;

  @IsOptional()
  @IsIn(["include", "exclude"])
  inventory: "include" | "exclude" = "include";

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
