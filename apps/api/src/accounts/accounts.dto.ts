import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import type { AccountStatus, PreferredLocale } from "../auth/auth.contracts";
import { PageQueryDto } from "../common/dto/page-query.dto";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class AccountQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(["PENDING_APPROVAL", "ACTIVE", "SUSPENDED"])
  status?: AccountStatus;

  @IsOptional()
  @IsIn(["ADMINISTRADOR", "JEFE_PLANTA"])
  roleCode?: "ADMINISTRADOR" | "JEFE_PLANTA";
}

export class PermissionSelectionDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissionCodes!: string[];
}

export class CreateAdministratorDto extends PermissionSelectionDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsIn(["es", "en"])
  preferredLocale: PreferredLocale = "es";
}

export class CreatePlantManagerDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[a-z]/u)
  @Matches(/[A-Z]/u)
  @Matches(/[0-9]/u)
  @Matches(/[^A-Za-z0-9\s]/u)
  password!: string;

  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^\d+$/u)
  pin!: string;

  @IsUUID()
  plantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  stationIds!: string[];

  @IsIn(["es", "en"])
  preferredLocale: PreferredLocale = "es";
}

export class AccountGovernanceDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason?: string;
}

export class UpdateLocaleDto {
  @IsIn(["es", "en"])
  locale!: PreferredLocale;
}
