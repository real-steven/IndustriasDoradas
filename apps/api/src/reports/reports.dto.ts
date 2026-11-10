import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsUUID,
} from "class-validator";

import type {
  ProductionReportField,
  ProductionReportSection,
  ReportLanguage,
} from "./reports.contracts";

export class ProductionReportQueryDto {
  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true, strictSeparator: true })
  fromUtc!: string;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true, strictSeparator: true })
  toUtc!: string;

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

  @ApiPropertyOptional({ default: "es", enum: ["es", "en"] })
  @IsOptional()
  @IsIn(["es", "en"])
  language: ReportLanguage = "es";

  @ApiPropertyOptional({
    default: ["summary", "shipments"],
    enum: ["summary", "shipments", "financial"],
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(["summary", "shipments", "financial"], { each: true })
  sections: ProductionReportSection[] = ["summary", "shipments"];

  @ApiPropertyOptional({
    default: ["date", "shipment", "supplier", "gold", "karat"],
    enum: [
      "date",
      "shipment",
      "supplier",
      "line",
      "gold",
      "karat",
      "cajuelas",
      "palos",
      "responsible",
      "sweeps",
    ],
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(
    [
      "date",
      "shipment",
      "supplier",
      "line",
      "gold",
      "karat",
      "cajuelas",
      "palos",
      "responsible",
      "sweeps",
    ],
    { each: true },
  )
  fields: ProductionReportField[] = [
    "date",
    "shipment",
    "supplier",
    "gold",
    "karat",
  ];
}
