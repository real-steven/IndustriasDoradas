import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class GoldFiltersDto {
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
}

export class GoldOverviewQueryDto {
  // Los cargamentos de una página: identificadores separados por comas.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  shipmentIds!: string[];
}

export class RecordShipmentGoldDto {
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  amountGrams!: number;

  // Opcional. null deja el quilataje sin registrar; omitirlo en una corrección
  // conserva el vigente.
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  @Max(24)
  karat?: number | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  correctionReason?: string;
}

export class ReviewShipmentGoldDto {
  @IsIn(["PENDING", "ACKNOWLEDGED", "OMITTED"])
  disposition!: "PENDING" | "ACKNOWLEDGED" | "OMITTED";

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class MercuryMeasurementDto {
  @IsUUID()
  lineComponentId!: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  inputGrams?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  remainderGrams?: number;
}

export class RecordSweepMercuryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => MercuryMeasurementDto)
  measurements!: MercuryMeasurementDto[];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  correctionReason?: string;
}
