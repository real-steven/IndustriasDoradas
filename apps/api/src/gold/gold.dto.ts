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

export class RecordShipmentGoldDto {
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  amountGrams!: number;

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
