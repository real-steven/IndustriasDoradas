import { PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class CreatePlantDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/u)
  @MaxLength(40)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timezone = "America/Costa_Rica";
}

export class UpdatePlantDto extends PartialType(CreatePlantDto) {}

export class CreateProductionLineDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/u)
  @MaxLength(40)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  displayOrder!: number;
}

export class UpdateProductionLineDto extends PartialType(
  CreateProductionLineDto,
) {}

export class CreateLineComponentDto extends CreateProductionLineDto {
  @IsUUID()
  componentTypeId!: string;
}

export class UpdateLineComponentDto extends PartialType(
  CreateLineComponentDto,
) {}

export class CreateStationDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/u)
  @MaxLength(40)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  deviceKey!: string;
}

export class UpdateStationDto extends PartialType(CreateStationDto) {}

export class CreateSupplierDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class SetCatalogStateDto {
  @IsBoolean()
  active!: boolean;
}
