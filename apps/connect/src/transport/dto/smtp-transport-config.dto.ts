import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsString,
  Min,
  MaxLength,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransportSMTPConfigDto {
  @ApiProperty({
    description: 'The SMTP host for the email transport.',
    example: 'smtp.example.com',
  })
  @IsString()
  @MaxLength(255)
  host: string;

  @ApiProperty({
    description: 'The port number for the email transport.',
    example: 587,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({
    description: 'Indicates if the connection should use SSL/TLS.',
    example: true,
  })
  @IsBoolean()
  secure: boolean;

  @ApiProperty({
    description: 'The username for the email transport authentication.',
    example: 'user@example.com',
  })
  @IsString()
  @MaxLength(255)
  username: string;

  @ApiProperty({
    description: 'The password for the email transport authentication.',
    example: 'supersecretpassword',
  })
  @IsString()
  @MaxLength(255)
  password: string;

  @ApiProperty({
    description: 'The default "from" address for outgoing emails.',
    example: 'no-reply@example.com',
  })
  @IsEmail()
  @MaxLength(255)
  defaultFrom: string;

  @ApiProperty({
    description: 'The default subject line for outgoing emails.',
    example: 'Welcome to Our Service!',
  })
  @IsString()
  @MaxLength(255)
  defaultSubject: string;
}
