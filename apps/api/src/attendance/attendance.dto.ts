import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID, Matches } from "class-validator";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export class AttendanceHoursQueryDto {
  @ApiProperty({ example: "2026-10-19", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(LOCAL_DATE)
  fromDate!: string;

  @ApiProperty({ example: "2026-10-25", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(LOCAL_DATE)
  toDate!: string;

  @IsOptional()
  @IsUUID()
  plantId?: string;

  @IsOptional()
  @IsUUID()
  workerId?: string;
}
