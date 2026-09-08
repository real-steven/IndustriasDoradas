import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import type { WorkerRequestStatus, WorkerStatus } from "./workers.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class WorkerRequestQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED", "MERGED"])
  status?: WorkerRequestStatus;

  @IsOptional()
  @IsUUID()
  plantId?: string;
}

export class WorkerQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["PROVISIONAL", "PROVISIONAL_VENCIDO", "ACTIVO", "RECHAZADO"])
  status?: WorkerStatus;

  @IsOptional()
  @IsUUID()
  plantId?: string;
}

export class CreateWorkerRequestDto {
  @IsUUID()
  plantId!: string;

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

export class ResolveWorkerRequestDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason?: string;
}

export class MergeWorkerRequestDto extends ResolveWorkerRequestDto {
  @IsUUID()
  canonicalWorkerId!: string;
}

export class SetWorkerStateDto {
  @IsBoolean()
  active!: boolean;
}
