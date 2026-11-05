import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

import { PAYROLL_ADJUSTMENT_TYPES } from "./payroll.contracts";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const HOUR_ADJUSTMENTS = new Set([
  "PAID_LEAVE_HOURS",
  "OVERTIME_HOURS",
  "HOLIDAY_HOURS",
  "REST_DAY_HOURS",
]);

export class PayrollQueryDto {
  @Matches(LOCAL_DATE)
  fromDate!: string;

  @Matches(LOCAL_DATE)
  toDate!: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;
}

export class PayrollWorkerDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class UpdatePayrollWorkerProfileDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  identityNumber!: string | null;
}

export class CreatePayrollRateDto {
  @ApiProperty({ example: 2000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  regularHourlyRateCrc!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  @Max(5)
  nightMultiplier?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T/u)
  effectiveFromUtc?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason!: string;
}

export class CreatePayrollAdjustmentDto {
  @Matches(LOCAL_DATE)
  adjustmentDate!: string;

  @IsIn([...PAYROLL_ADJUSTMENT_TYPES])
  adjustmentType!: (typeof PAYROLL_ADJUSTMENT_TYPES)[number];

  @ValidateIf((object: CreatePayrollAdjustmentDto) =>
    HOUR_ADJUSTMENTS.has(object.adjustmentType),
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(24 * 60)
  minutes?: number;

  @ValidateIf((object: CreatePayrollAdjustmentDto) =>
    object.adjustmentType.startsWith("OTHER_"),
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountCrc?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}
