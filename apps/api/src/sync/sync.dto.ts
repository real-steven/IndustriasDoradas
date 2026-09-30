import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import type {
  SyncAuthorizationEvidence,
  SyncEnvelopeItem,
} from "./sync.contracts";

export class SyncClientDto {
  @IsIn(["desktop"])
  application!: "desktop";

  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u)
  applicationVersion!: string;
}

export class SyncScopeDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  plantId!: string;

  @IsUUID()
  stationId!: string;
}

export class SyncAuthorizationDto implements SyncAuthorizationEvidence {
  @IsUUID()
  actorProfileId!: string;

  @IsInt()
  @Min(1)
  permissionVersion!: number;

  @IsDateString({ strict: true })
  validatedAtUtc!: string;

  @IsDateString({ strict: true })
  offlineValidUntilUtc!: string;

  @IsIn(["VALID", "EXPIRED_CONTINGENCY", "LEGACY_UNAVAILABLE"])
  stateAtCapture!: SyncAuthorizationEvidence["stateAtCapture"];
}

export class SyncItemDto implements SyncEnvelopeItem {
  @IsUUID()
  outboxMessageId!: string;

  @IsInt()
  @Min(1)
  stationSequence!: number;

  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Z][A-Z0-9_]*$/u)
  operationType!: string;

  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9_]*$/u)
  aggregateType!: string;

  @IsUUID()
  aggregateId!: string;

  @IsInt()
  @Min(1)
  payloadSchemaVersion!: number;

  @IsDateString({ strict: true })
  createdAtUtc!: string;

  @ValidateNested()
  @Type(() => SyncAuthorizationDto)
  authorization!: SyncAuthorizationDto;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncPushDto {
  @IsInt()
  @Min(1)
  contractVersion!: number;

  @IsUUID()
  batchId!: string;

  @IsDateString({ strict: true })
  sentAtUtc!: string;

  @ValidateNested()
  @Type(() => SyncClientDto)
  client!: SyncClientDto;

  @ValidateNested()
  @Type(() => SyncScopeDto)
  scope!: SyncScopeDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}

export class SyncPullQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 100;
}
