import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { CommandPlan, ResourceRef } from '../command/command.types';
import { RcloneService } from '../storage/rclone.service';
import { SharedRootsService } from '../storage/shared-roots.service';
import { parsePathsRegistry } from './paths-registry.parser';
import { InitInput, ParsedPathsRegistry } from './init.types';

@Injectable()
export class InitSourcePlanService {
  constructor(
    private readonly roots: SharedRootsService,
    private readonly rclone: RcloneService,
  ) {}

  async resolve(input: InitInput): Promise<CommandPlan<InitInput>> {
    const area = process.env.NYX_INIT_AREA?.trim() || 'MAIN';
    const registryPath = process.env.NYX_PATHS_REGISTRY_PATH?.trim();
    if (!registryPath) throw new Error('NYX_PATHS_REGISTRY_PATH is required');

    const { stdout } = await this.rclone.run([
      'cat',
      this.roots.resolve(area, registryPath),
    ]);
    if (!stdout.trim()) throw new Error('paths registry is empty');

    const parsed = parsePathsRegistry(stdout);
    return {
      command: 'ini',
      resolvedAt: new Date().toISOString(),
      sources: this.buildSources(input, parsed, registryPath),
      payload: input,
    };
  }

  private buildSources(
    input: InitInput,
    parsed: ParsedPathsRegistry,
    registryPath: string,
  ): ResourceRef[] {
    const depth = input.depth ?? 'normal';
    const areaRoot = process.env.NYX_AREAS_ROOT_PATH?.trim();
    if (!areaRoot) throw new Error('NYX_AREAS_ROOT_PATH is required');

    const sources: ResourceRef[] = [
      {
        key: 'paths.md',
        rclonePath: registryPath,
        required: true,
        visible: false,
        verify: { nonEmpty: true },
      },
      ...(['Head', 'Body', 'Footer'] as const).map((role) => ({
        key: `canonical ${role}`,
        driveId: parsed.core[role]?.driveId,
        rclonePath: parsed.core[role]?.repositoryPath,
        required: true,
        visible: false,
      })),
      {
        key: 'Head paths.json',
        driveId: parsed.core.Head?.driveId,
        required: true,
        visible: false,
      },
      {
        key: 'Head nyxcli.json',
        driveId: parsed.core.Head?.driveId,
        required: true,
        visible: false,
      },
      this.route(parsed, 'temp_paths.json', 'temp_paths', false),
      this.route(parsed, 'temp_nyxcli.json', 'temp_nyxcli', false),
      this.route(parsed, 'nyx_entry.md', 'nyx_entry_temp', false),
      this.route(parsed, 'template_map.md', 'template_map', false),
      this.route(parsed, 'template_index.json', 'template_index', false),
      this.route(parsed, 'basic Maps', 'template_map', true),
      this.route(parsed, 'todo.md', 'todo_current', true),
      this.route(parsed, 'todo_week.md', 'todo_week', true),
      this.route(parsed, 'todo_month.md', 'todo_month', true),
      this.route(parsed, 'toget.md', 'toget', true),
    ];

    if (depth !== 'basic') {
      sources.push({
        key: 'must_have.md',
        rclonePath:
          process.env.NYX_MUST_HAVE_PATH?.trim() ||
          'Documents/Notepad/0_active/must_have.md',
        required: true,
        visible: true,
      });
      for (const [area, pointer] of Object.entries(parsed.areas)) {
        sources.push({
          key: `Area state:${area}`,
          driveId: pointer.stateId,
          rclonePath: path.posix.join(areaRoot, area, '0_state/state.json'),
          required: true,
          visible: false,
        });
      }
      const specialized = this.specializedStatePaths();
      for (const [key, rclonePath] of Object.entries(specialized)) {
        sources.push({
          key: `specialized:${key}`,
          rclonePath,
          required: true,
          visible: false,
        });
      }
    }

    return sources;
  }

  private specializedStatePaths(): Record<string, string> {
    const raw = process.env.NYX_INIT_SPECIALIZED_STATE_JSON?.trim();
    if (!raw) {
      return {
        'NoteFlow todo.json':
          'ChatGPT/1_body/1_areas_v0/NoteFlow/0_state/todo.json',
        'FileFilter paths.json':
          'ChatGPT/1_body/1_areas_v0/FileFilter/0_state/paths.json',
      };
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => Boolean(key) && typeof value === 'string' && Boolean(value),
      ),
    );
  }

  private route(
    parsed: ParsedPathsRegistry,
    key: string,
    routeKey: string,
    visible: boolean,
  ): ResourceRef {
    const route = parsed.routes[routeKey];
    return {
      key,
      driveId: route?.driveId,
      rclonePath: route?.repositoryPath,
      required: true,
      visible,
      verify: { nonEmpty: true },
    };
  }
}
