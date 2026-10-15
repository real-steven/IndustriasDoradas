import { Transform } from "class-transformer";
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
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
