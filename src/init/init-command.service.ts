import { Injectable } from '@nestjs/common';
import { CommandExecutionService } from '../command/command-execution.service';
import {
  ReadReceipt,
  RenderReceipt,
  ResourceRef,
} from '../command/command.types';
import { InitService } from './init.service';
import { InitInput, InitReadiness } from './init.types';

type Evidence = {
  loaded?: boolean;
  path?: string;
  sha256?: string;
  bytes?: number;
  document?: unknown;
  error?: string;
};

@Injectable()
export class InitCommandService {
  constructor(
    private readonly init: InitService,
    private readonly commands: CommandExecutionService,
  ) {}

  async initialize(input: InitInput = {}) {
    const execution = await this.commands.run(
      'ini',
      async () => ({
        command: 'ini',
        resolvedAt: new Date().toISOString(),
        sources: this.resolveSourcePlan(input),
        payload: input,
      }),
      async () => this.init.initialize(input),
      async (_plan, result: any) => result?.readiness !== 'NOT_READY',
    );

    const result = execution.result as any;
    const commandExecution = {
      command: execution.command,
      status: execution.status,
      phase: execution.phase ?? null,
      error: execution.error ?? null,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      resolvedSources: execution.plan?.sources ?? [],
    };

    if (!result) {
      return {
        schema: 'nyx.initialization.receipt.v3',
        initializedAt: new Date().toISOString(),
        readiness: 'NOT_READY' as InitReadiness,
        scope: input.scope ?? 'local',
        depth: input.depth ?? 'normal',
        target: input.target?.trim() || null,
        sourceManifest: this.resolveSourcePlan(input),
        readReceipts: [],
        renderReceipts: [],
        warnings: [execution.error ?? 'Initialization command failed'],
        commandExecution,
      };
    }

    const { sourceManifest, readReceipts, renderReceipts } =
      this.receiptsFromInitialization(result, input);

    return {
      ...result,
      schema: 'nyx.initialization.receipt.v3',
      sourceManifest,
      readReceipts,
      renderReceipts,
      commandExecution,
    };
  }

  private resolveSourcePlan(input: InitInput): ResourceRef[] {
    const depth = input.depth ?? 'normal';
    const registryPath =
      process.env.NYX_PATHS_REGISTRY_PATH?.trim() ||
      'Documents/Nyxpad/paths.md';

    const sources: ResourceRef[] = [
      {
        key: 'paths.md',
        driveId: '1wESsjmMn6FgnRj6_6eGeGtVKwrxoqwS_',
        rclonePath: registryPath,
        required: true,
        visible: false,
        verify: {
          nonEmpty: true,
          expectedDriveId: '1wESsjmMn6FgnRj6_6eGeGtVKwrxoqwS_',
        },
      },
      { key: 'canonical Head', required: true, visible: false },
      { key: 'canonical Body', required: true, visible: false },
      { key: 'canonical Footer', required: true, visible: false },
      { key: 'Head paths.json', required: true, visible: false },
      { key: 'Head nyxcli.json', required: true, visible: false },
      { key: 'temp_paths.json', required: true, visible: false },
      { key: 'temp_nyxcli.json', required: true, visible: false },
      { key: 'nyx_entry.md', required: true, visible: false },
      { key: 'template_map.md', required: true, visible: false },
      { key: 'template_index.json', required: true, visible: false },
      { key: 'basic Maps', required: true, visible: true },
      { key: 'todo.md', required: true, visible: true },
      { key: 'todo_week.md', required: true, visible: true },
      { key: 'todo_month.md', required: true, visible: true },
      { key: 'toget.md', required: true, visible: true },
    ];

    if (depth !== 'basic') {
      sources.push({ key: 'must_have.md', required: true, visible: true });
      sources.push({
        key: 'live Area states',
        required: true,
        visible: false,
      });
      sources.push({
        key: 'specialized machine state',
        required: true,
        visible: false,
      });
    }

    if (depth === 'deep') {
      sources.push({
        key: 'command/Area authoritative deep sources',
        required: false,
        visible: false,
      });
    }

    return sources;
  }

  private receiptsFromInitialization(result: any, input: InitInput) {
    const plan = this.resolveSourcePlan(input);
    const readReceipts: ReadReceipt[] = [];
    const renderReceipts: RenderReceipt[] = [];

    const registry = result?.authority?.registry;
    readReceipts.push({
      key: 'paths.md',
      ok: Boolean(registry),
      transport: 'rclone',
      rclonePath: registry?.path,
      sha256: registry?.sha256,
      error: registry ? undefined : 'MISSING_REGISTRY_RECEIPT',
    });

    for (const item of result?.authority?.coreVerification ?? []) {
      readReceipts.push({
        key: `canonical ${item.role}`,
        ok: Boolean(item.verified),
        transport: 'rclone',
        driveId: item.expectedDriveId,
        rclonePath: item.storagePath,
        sha256: item.actualSha256,
        error: item.error,
      });
    }

    const bootstrap = result?.bootstrap ?? {};
    this.pushEvidence(readReceipts, 'temp_paths.json', bootstrap.tempPaths);
    this.pushEvidence(readReceipts, 'temp_nyxcli.json', bootstrap.tempNyxCli);
    this.pushEvidence(readReceipts, 'nyx_entry.md', bootstrap.nyxEntry);
    this.pushEvidence(readReceipts, 'template_map.md', bootstrap.templateMap);
    this.pushEvidence(readReceipts, 'template_index.json', bootstrap.templateIndex);

    const canonicalMachine = result?.authority?.canonicalMachine;
    readReceipts.push({
      key: 'Head paths.json',
      ok: Boolean(canonicalMachine?.paths?.verified),
      transport: 'head-zip',
      sha256: canonicalMachine?.paths?.sha256,
      bytes: canonicalMachine?.paths?.bytes,
      error: canonicalMachine?.paths?.error,
    });
    readReceipts.push({
      key: 'Head nyxcli.json',
      ok: Boolean(canonicalMachine?.cli?.verified),
      transport: 'head-zip',
      sha256: canonicalMachine?.cli?.sha256,
      bytes: canonicalMachine?.cli?.bytes,
      error: canonicalMachine?.cli?.error,
    });

    const visible = result?.visibleSources ?? {};
    const visibleNames: Record<string, string> = {
      todo_current: 'todo.md',
      todo_week: 'todo_week.md',
      todo_month: 'todo_month.md',
      toget: 'toget.md',
      must_have: 'must_have.md',
      basic_maps: 'basic Maps',
    };
    for (const [rawName, evidence] of Object.entries(visible)) {
      const name = visibleNames[rawName] ?? rawName;
      this.pushEvidence(readReceipts, name, evidence as Evidence);
      const loaded = Boolean((evidence as Evidence)?.loaded);
      renderReceipts.push({
        key: name,
        ok: loaded,
        mode: loaded ? 'exact' : 'hidden',
        bytes: (evidence as Evidence)?.bytes,
        error: (evidence as Evidence)?.error,
      });
    }

    for (const source of plan.filter((item) => !item.visible)) {
      if (!renderReceipts.some((item) => item.key === source.key)) {
        renderReceipts.push({
          key: source.key,
          ok: true,
          mode: 'hidden',
        });
      }
    }

    return {
      sourceManifest: plan,
      readReceipts,
      renderReceipts,
    };
  }

  private pushEvidence(
    receipts: ReadReceipt[],
    key: string,
    evidence: Evidence | undefined,
  ) {
    receipts.push({
      key,
      ok: Boolean(evidence?.loaded),
      transport: 'rclone',
      rclonePath: evidence?.path,
      sha256: evidence?.sha256,
      bytes: evidence?.bytes,
      error: evidence?.error,
    });
  }
}
