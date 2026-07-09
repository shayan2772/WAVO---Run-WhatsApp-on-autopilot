import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Name of the first business/workspace to create' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessName?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class SwitchBusinessDto {
  @ApiProperty()
  @IsString()
  businessId: string;
}

export class CreateBusinessDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;
}
