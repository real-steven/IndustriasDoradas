import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import {
  REPORT_EXPENSE_CATEGORIES,
  REPORT_SETTLEMENT_STATUSES,
  type ReportExpenseCategory,
  type ReportSettlementStatus,
} from "./report-settlements.contracts";

export class ReportSettlementQueryDto {
  @IsISO8601({ strict: true })
  fromDate!: string;

  @IsISO8601({ strict: true })
  toDate!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsIn(REPORT_SETTLEMENT_STATUSES)
  status?: ReportSettlementStatus;
}

export class ReportSettlementLineDto {
  @IsUUID()
  shipmentId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  assayLabel?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(24)
  karat!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  gramsLiquidated!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerKaratCrc?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerGramCrc!: number;
}

export class ReportSettlementExpenseDto {
  @IsIn(REPORT_EXPENSE_CATEGORIES)
  category!: ReportExpenseCategory;

  @IsString()
  @Length(1, 160)
  concept!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountCrc!: number;

  @IsISO8601({ strict: true })
  occurredOn!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  responsibleName?: string;
}

export class SaveReportSettlementDto {
  @IsUUID()
  supplierId!: string;

  @IsISO8601({ strict: true })
  weekStart!: string;

  @IsString()
  @Length(1, 160)
  buyerName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  destination?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  participationPercentage!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  receivedAmountCrc?: number;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReportSettlementLineDto)
  lines!: ReportSettlementLineDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportSettlementExpenseDto)
  expenses: ReportSettlementExpenseDto[] = [];
}

export class UpdateReportSettlementDto extends SaveReportSettlementDto {
  @IsInt()
  @Min(1)
  rowVersion!: number;
}

export class TransitionReportSettlementDto {
  @IsInt()
  @Min(1)
  rowVersion!: number;

  @IsIn(REPORT_SETTLEMENT_STATUSES)
  status!: ReportSettlementStatus;
}
