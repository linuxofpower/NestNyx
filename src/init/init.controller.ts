import { Body, Controller, Post } from '@nestjs/common';
import { InitCommandService } from './init-command.service';
import { InitInput } from './init.types';

@Controller('init')
export class InitController {
  constructor(private readonly init: InitCommandService) {}

  @Post()
  initialize(@Body() body: InitInput) {
    return this.init.initialize(body ?? {});
  }
}
