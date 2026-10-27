import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { PageQueryDto } from "../common/dto/page-query.dto";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;
const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === "string"
    ? value.trim().toUpperCase().replace(/\s+/gu, "_")
    : value;

export class InventoryCatalogQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  plantId?: string;
}

export class InventoryHistoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "desc";
}

export class InventoryReviewHistoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsOptional()
  @IsBoolean()
  differencesOnly = false;
}

export class InventoryComponentHistoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  rastraId?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "desc";
}

export class CreateInventoryItemTypeDto {
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/u)
  @MaxLength(40)
  code!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  isCustom = false;
}

export class CreateInventoryUnitDto extends CreateInventoryItemTypeDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  decimalPlaces!: number;
}

export class CreateInventoryItemDto {
  @IsUUID()
  itemTypeId!: string;

  @IsUUID()
  unitId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
}

export class SetInventoryCatalogStateDto {
  @IsBoolean()
  active!: boolean;
}

export class RecordInventoryMovementDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsUUID()
  unitId!: string;

  @IsIn(["ENTRY", "EXIT", "CONSUMPTION", "RETURN"])
  movementType!: "ENTRY" | "EXIT" | "CONSUMPTION" | "RETURN";

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  responsibleWorkerId?: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  occurredAtUtc!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  destination?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  relatedMovementId?: string;
}

export class RecordInventoryAdjustmentDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsUUID()
  unitId!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  quantityDelta!: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  occurredAtUtc!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  notes?: string;
}

export class ReverseInventoryMovementDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  occurredAtUtc!: string;
}

export class InventoryReviewLineDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsUUID()
  unitId!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  expectedQuantity!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  countedQuantity!: number;
}

export class RecordInventoryReviewDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  reviewedAtUtc!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InventoryReviewLineDto)
  lines!: InventoryReviewLineDto[];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  notes?: string;
}

export class RecordRastraComponentChangeDto {
  @IsUUID()
  rastraId!: string;

  @IsIn(["INSTALLATION", "REMOVAL", "REPLACEMENT"])
  changeType!: "INSTALLATION" | "REMOVAL" | "REPLACEMENT";

  @IsUUID()
  installationId!: string;

  @IsOptional()
  @IsUUID()
  replacedInstallationId?: string;

  @IsOptional()
  @IsUUID()
  inventoryItemId?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsUUID()
  responsibleWorkerId?: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  occurredAtUtc!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  componentIdentifier?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  installedCondition?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  removedCondition?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  installationNotes?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  removalNotes?: string;
}
