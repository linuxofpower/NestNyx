import { Injectable } from '@nestjs/common';
import {
  CommandExecutionReceipt,
  CommandPlan,
} from './command.types';

@Injectable()
export class CommandExecutionService {
  async run<TPlanPayload, TResult>(
    command: string,
    resolve: () => Promise<CommandPlan<TPlanPayload>>,
    act: (plan: CommandPlan<TPlanPayload>) => Promise<TResult>,
    verify: (
      plan: CommandPlan<TPlanPayload>,
      result: TResult,
    ) => Promise<boolean> | boolean,
  ): Promise<CommandExecutionReceipt<TResult>> {
    const startedAt = new Date().toISOString();

    let plan: CommandPlan<TPlanPayload>;
    try {
      plan = await resolve();
    } catch (error) {
      return this.finish({
        command,
        status: 'FAILED_RESOLVE',
        phase: 'RESOLVE',
        error: this.message(error),
        startedAt,
      });
    }

    let result: TResult;
    try {
      result = await act(plan);
    } catch (error) {
      return this.finish({
        command,
        status: 'FAILED_ACT',
        phase: 'ACT',
        error: this.message(error),
        plan,
        startedAt,
      });
    }

    try {
      const verified = await verify(plan, result);
      if (!verified) {
        return this.finish({
          command,
          status: 'FAILED_VERIFY',
          phase: 'VERIFY',
          error: 'VERIFICATION_FAILED',
          plan,
          result,
          startedAt,
        });
      }
    } catch (error) {
      return this.finish({
        command,
        status: 'FAILED_VERIFY',
        phase: 'VERIFY',
        error: this.message(error),
        plan,
        result,
        startedAt,
      });
    }

    return this.finish({
      command,
      status: 'COMPLETE',
      plan,
      result,
      startedAt,
    });
  }

  private finish<T>(
    receipt: Omit<CommandExecutionReceipt<T>, 'finishedAt'>,
  ): CommandExecutionReceipt<T> {
    return {
      ...receipt,
      finishedAt: new Date().toISOString(),
    };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
