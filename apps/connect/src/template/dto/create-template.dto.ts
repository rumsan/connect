import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateType } from '@prisma/client';
import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Template name',
    example: 'welcome_message',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Template body/content',
    example: 'Hello {{1}}, welcome to our service!',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  body: string;

  @ApiProperty({
    description: 'Application ID',
    example: 'app_123456',
  })
  @IsString()
  @IsNotEmpty()
  app: string;

  @ApiProperty({
    description: 'Template type',
    enum: TemplateType,
    example: TemplateType.TEXT,
  })
  @IsEnum(TemplateType)
  @IsNotEmpty()
  type: TemplateType;

  @ApiProperty({
    description: 'Transport CUID',
    example: 'transport_123456',
  })
  @IsString()
  @IsNotEmpty()
  transport: string;

  @ApiPropertyOptional({
    description: 'Template language code (ISO 639-1)',
    example: 'en',
    minLength: 2,
    maxLength: 10,
    default: 'en',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({
    description: 'Template variables as key-value pairs',
    example: { name: 'John', company: 'Acme Corp' },
    type: Object,
  })
  @IsOptional()
  variables?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Media URLs for MEDIA type templates',
    example: ['https://example.com/image.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media?: string[];
}
