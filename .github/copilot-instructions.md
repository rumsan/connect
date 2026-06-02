# GitHub Copilot Instructions for Rumsan Connect

## Repository Overview

Rumsan Connect is a communication hub that registers external services like SMS, Email, Asterisk (Voice), Slack, and WhatsApp. It provides a uniform method to broadcast messages to recipients with built-in queue and scheduling services to ensure all messages are delivered successfully.

## Technology Stack

- **Framework**: NestJS (with Fastify adapter)
- **Language**: TypeScript
- **Build Tool**: Nx monorepo
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: Bull (Redis-based job queue)
- **Logging**: Winston
- **Testing**: Jest
- **Code Quality**: ESLint + Prettier

## Project Structure

This is an Nx monorepo with the following structure:

### Apps
- `apps/connect/` - Main NestJS application server
- `apps/asterisk-worker/` - Asterisk voice communication worker
- `apps/connect-e2e/` - End-to-end tests for connect
- `apps/asterisk-worker-e2e/` - End-to-end tests for asterisk-worker

### Libraries
- `libs/queue/` - Queue management library
- `libs/transports/` - Communication transport implementations (SMTP, Voice, API, SES, Echo)
- `libs/workers/` - Worker implementations
- `libs/sdk/` - SDK library published as `@rumsan/connect`

### Path Aliases
Use the following TypeScript path aliases:
- `@rsconnect/queue` - Queue library
- `@rsconnect/transports` - Transports library
- `@rsconnect/workers` - Workers library
- `@rumsan/connect` - SDK library
- `@rumsan/prisma` - Prisma service (external package)
- `@rumsan/extensions` - Extensions library (external package)
- `@rumsan/app` - App utilities (external package)
- `@rumsan/sdk` - Rumsan SDK (external package)

## Code Style and Conventions

### Prettier Configuration
- Single quotes
- Trailing commas (all)
- Tab width: 2 spaces
- Semicolons: required
- Print width: 80 characters
- End of line: auto

### ESLint
- Nx module boundary enforcement is enabled
- TypeScript and JavaScript linting via Nx plugins
- Jest environment for test files (*.spec.ts)

### Naming Conventions
- Use camelCase for variables and functions
- Use PascalCase for classes, interfaces, and types
- Use kebab-case for file names
- Use descriptive names that reflect purpose

### File Structure
- DTOs in `dto/` subdirectories
- Entities in `entities/` subdirectories
- Services follow NestJS naming: `*.service.ts`
- Modules follow NestJS naming: `*.module.ts`
- Tests follow naming: `*.spec.ts`

## Development Commands

### Starting the Application
```bash
# Start main connect application
npx nx serve connect
# or
npm run start:dev

# Start asterisk worker
npx nx serve asterisk-worker
# or
npm run start:asterisk-worker
```

### Building
```bash
# Build all projects
npm run build:all
# or
npx nx run-many --target=build --all

# Build specific project
npx nx build connect
```

### Testing
```bash
# Run tests for specific project
npx nx test connect

# Run all tests
npx nx run-many -t test

# Run e2e tests
npx nx e2e connect-e2e
```

### Database
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### Linting
```bash
# Lint specific project
npx nx lint connect

# Lint all projects
npx nx run-many -t lint
```

## Architecture and Patterns

### NestJS Architecture
- Follow NestJS modular architecture
- Use dependency injection for services
- Implement proper DTOs with class-validator decorators
- Use NestJS decorators appropriately (@Injectable, @Controller, etc.)

### API Design
- Global prefix: `/api/v1`
- Use Swagger/OpenAPI decorators for API documentation
- Enable CORS by default
- Payload size limit: 50mb
- Use validation pipes with whitelist and transform options

### Database (Prisma)
- Database provider: PostgreSQL
- Use Prisma Client for database operations
- Generate client after schema changes
- Follow Prisma naming conventions

### Queue Management (Bull)
- Use Bull for job queue management
- Implement proper processors for different job types
- Handle job failures and retries appropriately

### Transport Types
Available transport types (enum TransportType):
- SMTP - Email via SMTP
- VOICE - Voice calls via Asterisk
- API - Generic API transport
- SES - AWS Simple Email Service
- ECHO - Echo/test transport

### Session and Broadcast Status
- SessionStatus: NEW, PENDING, COMPLETED, FAILED
- BroadcastStatus: SCHEDULED, PENDING, SUCCESS, FAIL
- TriggerType: IMMEDIATE, SCHEDULED, MANUAL

### Logging
- Use Winston logger for structured logging
- Logger is configured globally via NestModule
- Use appropriate log levels (error, warn, info, debug)

### Error Handling
- Use RsExceptionFilter for global exception handling
- Implement proper error responses
- Use ResponseTransformInterceptor for response formatting

## Testing Best Practices

### Unit Tests
- Write tests in `*.spec.ts` files
- Use Jest as the testing framework
- Follow NestJS testing patterns with TestingModule
- Mock external dependencies
- Test edge cases and error scenarios

### E2E Tests
- Place e2e tests in separate e2e apps
- Test full API flows
- Use realistic test data

## Dependencies and Packages

### Core Dependencies
- @nestjs/* - NestJS framework packages
- @prisma/client - Prisma ORM client
- bull - Job queue
- nodemailer - Email sending
- asterisk-manager, ari-client - Asterisk integration
- amqplib - RabbitMQ integration
- winston, nest-winston - Logging

### Development Dependencies
- @nx/* - Nx monorepo tools
- @types/* - TypeScript type definitions
- eslint, prettier - Code quality tools
- jest - Testing framework
- prisma - Prisma CLI

## Best Practices

1. **Type Safety**: Always use TypeScript types and interfaces. Avoid `any`.

2. **Validation**: Use class-validator decorators in DTOs for input validation.

3. **Transformation**: Enable implicit conversion in ValidationPipe for proper DTO transformation.

4. **Module Organization**: Keep related functionality in dedicated modules following NestJS patterns.

5. **Configuration**: Use @nestjs/config for environment configuration.

6. **Error Messages**: Provide clear, actionable error messages.

7. **Documentation**: Document APIs with Swagger decorators.

8. **Testing**: Write tests for new functionality and maintain existing tests.

9. **Code Reuse**: Utilize shared libraries in `libs/` for common functionality.

10. **Nx Commands**: Use Nx commands for consistent project operations across the monorepo.

## Common Patterns

### Creating a New Module
```typescript
// module-name.module.ts
import { Module } from '@nestjs/common';
import { ModuleNameService } from './module-name.service';
import { ModuleNameController } from './module-name.controller';

@Module({
  controllers: [ModuleNameController],
  providers: [ModuleNameService],
  exports: [ModuleNameService],
})
export class ModuleNameModule {}
```

### Creating a DTO
```typescript
// dto/create-something.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSomethingDto {
  @ApiProperty({ description: 'Name of the item' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsString()
  @IsOptional()
  description?: string;
}
```

### Creating a Service
```typescript
// module-name.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';

@Injectable()
export class ModuleNameService {
  private readonly logger = new Logger(ModuleNameService.name);

  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.modelName.findMany();
  }
}
```

## Git Workflow

- Follow conventional commit messages
- Keep commits focused and atomic
- Write descriptive commit messages
- Test before committing

## Additional Notes

- The repository uses pnpm as the package manager
- Docker configurations are available for both connect and asterisk-worker
- Bruno collections are available in the `bruno/` directory for API testing
- Documentation is in the `docs/` directory
