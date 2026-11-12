import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

import { PHONE_MAX_INPUT_LENGTH } from "./phone-number";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class UpdateOwnProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  /** Vacío o `null` elimina el teléfono. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(PHONE_MAX_INPUT_LENGTH)
  phone?: string | null;
}

export class EmailChangeDto {
  @Transform(trim)
  @IsEmail({}, { message: "email must be a valid email address" })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsUrl({
    require_tld: false,
    protocols: ["http", "https"],
    require_protocol: true,
  })
  @MaxLength(512)
  redirectTo?: string;
}

export class StationPhoneDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(PHONE_MAX_INPUT_LENGTH)
  phone!: string | null;

  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^\d+$/u)
  pin!: string;
}
