import {
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

import type { AuditCategory, AuditResult } from "./audit.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["operation", "people", "security", "administration"])
  category?: AuditCategory;

  /** Tipos de acción gerencial separados por coma, por ejemplo `LINE_STARTED,SWEEP_RECORDED`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Z][A-Z_]*(,[A-Z][A-Z_]*){0,9}$/u)
  kinds?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;

  @IsOptional()
  @IsUUID()
  productionLineId?: string;

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
