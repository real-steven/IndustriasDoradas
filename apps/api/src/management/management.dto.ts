import { Transform, Type, type TransformFnParams } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
} from "class-validator";

import type { ShipmentSort, StatisticsBucket } from "./management.contracts";
import { SHIPMENT_CODE_PATTERN } from "./shipment-code";

export class ManagementFreshnessQueryDto {
  @ApiPropertyOptional({
    description: "Cursor opaco devuelto por la consulta anterior",
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;
}

export class ManagementPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, type: Number })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1, type: Number })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ManagementQueryDto extends ManagementPageQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  fromUtc?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  toUtc?: string;

  @IsOptional()
  @IsUUID()
  plantId?: string;

  @IsOptional()
  @IsUUID()
  productionLineId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  responsibleWorkerId?: string;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;
}

export class ManagementShipmentQueryDto extends ManagementQueryDto {
  @ApiPropertyOptional({
    default: "recent",
    enum: ["recent", "oldest", "cajuelas_desc", "cajuelas_asc"],
  })
  @IsOptional()
  @IsIn(["recent", "oldest", "cajuelas_desc", "cajuelas_asc"])
  sort?: ShipmentSort;

  @ApiPropertyOptional({ enum: ["recorded", "pending"] })
  @IsOptional()
  @IsIn(["recorded", "pending"])
  goldResult?: "recorded" | "pending";

  @ApiPropertyOptional({
    description:
      "Identificador del cargamento: código corto de 8 caracteres (inicio del UUID) o UUID completo. No distingue mayúsculas y quita espacios al inicio y al final.",
    maxLength: 36,
    example: "5510B16A",
  })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(36)
  @Matches(SHIPMENT_CODE_PATTERN, {
    message: "shipmentCode must be an 8-character code or a full UUID",
  })
  shipmentCode?: string;
}

export class ManagementStatisticsQueryDto {
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true, strictSeparator: true })
  fromUtc!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true, strictSeparator: true })
  toUtc!: string;

  @ApiPropertyOptional({ default: "day", enum: ["day", "week", "month"] })
  @IsOptional()
  @IsIn(["day", "week", "month"])
  bucket: StatisticsBucket = "day";

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  plantId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  productionLineId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ default: false, type: Boolean })
  @Transform(({ value }: TransformFnParams): unknown => {
    const candidate: unknown = value;
    if (candidate === true || candidate === "true") return true;
    if (candidate === false || candidate === "false") return false;
    return candidate;
  })
  @IsBoolean()
  comparePrevious = false;
}
