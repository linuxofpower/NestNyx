import { Injectable } from '@nestjs/common';
import { CommandExecutionService } from '../command/command-execution.service';
import { InitService } from './init.service';
import { InitSourcePlanService } from './init-source-plan.service';
import { InitInput } from './init.types';

@Injectable()
export class InitCommandService {
  constructor(
    private readonly init: InitService,
    private readonly commands: CommandExecutionService,
    private readonly plans: InitSourcePlanService,
  ) {}

  async initialize(input: InitInput = {}) {
    const run = await this.commands.run(
      'ini',
      () => this.plans.resolve(input),
      () => this.init.initialize(input),
      async (_plan, result: any) => result?.readiness !== 'NOT_READY',
    );
    return {
      ...(run.result as any),
      commandExecution: {
        command: run.command,
        status: run.status,
        phase: run.phase ?? null,
        error: run.error ?? null,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
    };
  }
}
