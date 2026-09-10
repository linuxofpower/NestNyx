import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { McpAuthService } from './mcp-auth.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [StorageModule],
  controllers: [McpController],
  providers: [McpAuthService, McpService],
})
export class McpModule {}
