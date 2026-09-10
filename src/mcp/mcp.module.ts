import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [StorageModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
