import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class PinDto {
  @Transform(trim)
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  @Matches(/^\d+$/u)
  pin!: string;
}
