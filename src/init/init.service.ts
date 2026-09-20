import { BadRequestException, Injectable } from '@nestjs/common';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RcloneService } from '../storage/rclone.service';
import { SharedRootsService } from '../storage/shared-roots.service';
import { InitSessionStoreService } from './init-session-store.service';
import { parsePathsRegistry } from './paths-registry.parser';
import { CorePointer, InitInput, InitReadiness } from './init.types';

type ZipEntry = { getData(): Buffer };
type ZipReader = { getEntry(name: string): ZipEntry | null };
type ZipCtor = new (filename: string) => ZipReader;
const AdmZip = require('adm-zip') as ZipCtor;

@Injectable()
export class InitService {
  constructor(
    private readonly roots: SharedRootsService,
    private readonly rclone: RcloneService,
    private readonly sessions: InitSessionStoreService,
  ) {}

  async initialize(input: InitInput = {}) {
    const scope = input.scope ?? 'local';
    const target = input.target?.trim() || undefined;
    if (target && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(target)) {
      throw new BadRequestException('Invalid initialization target');
    }

    const area = process.env.NYX_INIT_AREA?.trim() || 'MAIN';
    const registryPath =
      process.env.NYX_PATHS_REGISTRY_PATH?.trim() ||
      'ChatGPT/1_body/1_areas_v0/NoteFlow/3_resources/SYSTEM/paths.md';

    const registryTarget = this.roots.resolve(area, registryPath);
    const [{ stdout: registryMarkdown }, registryStat] = await Promise.all([
      this.rclone.run(['cat', registryTarget]),
      this.rclone.json(['lsjson', registryTarget, '--stat', '--hash']),
    ]);

    const parsed = parsePathsRegistry(registryMarkdown);
    const warnings: string[] = [];

    for (const role of ['Head', 'Body', 'Footer'] as const) {
      if (!parsed.core[role]) warnings.push(`Missing canonical ${role} pointer in paths registry`);
    }
    if (!parsed.commandTable) warnings.push('Missing canonical Yaro command-table pointer in paths registry');

    const coreVerification = await Promise.all(
      (['Head', 'Body', 'Footer'] as const)
        .map((role) => parsed.core[role])
        .filter((pointer): pointer is CorePointer => Boolean(pointer))
        .map((pointer) => this.verifyCore(area, pointer)),
    );

    for (const verification of coreVerification) {
      if (!verification.verified) {
        warnings.push(`${verification.role} verification failed: ${verification.error}`);
      }
    }

    const commandVerification = await this.verifyCommandTable(
      area,
      parsed.core.Head,
      parsed.commandTable?.file,
      parsed.commandTable?.bundlePath,
    );
    if (!commandVerification.verified) {
      warnings.push(`Command-table verification failed: ${commandVerification.error}`);
    }

    let areaHydration: unknown = undefined;
    if (target) {
      const pointer = parsed.areas[target];
      if (!pointer) {
        warnings.push(`Target Area ${target} is not present in Operational Area routing`);
      } else {
        areaHydration = await this.hydrateArea(area, target, pointer, warnings);
      }
    }

    const mandatoryReady =
      coreVerification.length === 3 &&
      coreVerification.every((item) => item.verified) &&
      commandVerification.verified;

    const readiness: InitReadiness = !mandatoryReady
      ? 'NOT_READY'
      : warnings.length
        ? 'READY_WITH_WARNINGS'
        : 'READY';

    const receipt = {
      schema: 'nyx.initialization.receipt.v1',
      initializedAt: new Date().toISOString(),
      readiness,
      scope,
      target: target ?? null,
      authority: {
        registry: {
          area,
          path: registryPath,
          stat: registryStat,
        },
        core: parsed.core,
        coreVerification,
        commandTable: parsed.commandTable ?? null,
        commandVerification,
      },
      area: areaHydration ?? null,
      warnings,
      mutation: {
        coreBundlesChanged: false,
        areaStateChanged: false,
        sessionStateOnly: true,
      },
    };

    const session = await this.sessions.upsert(
      input.sessionId,
      target,
      scope,
      receipt,
    );

    return {
      ...receipt,
      session: {
        id: session.id,
        durable: this.sessions.isDurable(),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    };
  }

  private async verifyCore(area: string, pointer: CorePointer) {
    const relativePath = this.repositoryPathToStoragePath(pointer.repositoryPath);
    const target = this.roots.resolve(area, relativePath);
    try {
      const stat = await this.rclone.json(['lsjson', target, '--stat', '--hash']);
      return {
        role: pointer.role,
        verified: true,
        repositoryPath: pointer.repositoryPath,
        storagePath: relativePath,
        expectedDriveId: pointer.driveId,
        stat,
      };
    } catch (error) {
      return {
        role: pointer.role,
        verified: false,
        repositoryPath: pointer.repositoryPath,
        storagePath: relativePath,
        expectedDriveId: pointer.driveId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async verifyCommandTable(
    area: string,
    head: CorePointer | undefined,
    expectedFile: string | undefined,
    bundlePath: string | undefined,
  ) {
    if (!head || !expectedFile || !bundlePath) {
      return { verified: false, error: 'Head or command-table pointer is missing' };
    }

    const member = bundlePath.split('::')[1];
    if (!member) return { verified: false, error: 'Command-table bundle member is missing' };

    const remoteHead = this.roots.resolve(
      area,
      this.repositoryPathToStoragePath(head.repositoryPath),
    );
    const tempFile = path.join(os.tmpdir(), `nyx-head-${process.pid}-${Date.now()}.zip`);

    try {
      await this.rclone.run(['copyto', remoteHead, tempFile]);
      const zip = new AdmZip(tempFile);
      const entry = zip.getEntry(member);
      if (!entry) return { verified: false, error: `Bundle member not found: ${member}` };

      const payload = JSON.parse(entry.getData().toString('utf8')) as Record<string, unknown>;
      return {
        verified: true,
        file: expectedFile,
        member,
        schema: payload.schema ?? null,
        version: payload.version ?? null,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      fs.rmSync(tempFile, { force: true });
    }
  }

  private async hydrateArea(
    storageArea: string,
    target: string,
    pointer: {
      rootId: string;
      manifestId: string;
      stateFolderId: string;
      stateId: string;
      configId: string;
    },
    warnings: string[],
  ) {
    const root =
      process.env.NYX_AREAS_ROOT_PATH?.trim() ||
      'ChatGPT/1_body/1_areas_v0';

    const base = path.posix.join(root, target);
    const files = {
      manifest: path.posix.join(base, 'area_paths_v001.json'),
      state: path.posix.join(base, '0_state/state.json'),
      config: path.posix.join(base, '0_state/config.json'),
    };

    const result: Record<string, unknown> = {
      pointer,
      storagePaths: files,
    };

    for (const [name, relativePath] of Object.entries(files)) {
      try {
        const remote = this.roots.resolve(storageArea, relativePath);
        const { stdout } = await this.rclone.run(['cat', remote]);
        result[name] = JSON.parse(stdout);
      } catch (error) {
        warnings.push(
          `Area ${target} ${name} hydration failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return result;
  }

  private repositoryPathToStoragePath(repositoryPath: string) {
    const prefix = process.env.NYX_YARO_PREFIX?.trim() || 'YaRoute';
    if (repositoryPath === 'YaRoute') return prefix;
    if (repositoryPath.startsWith('YaRoute/')) {
      return `${prefix}/${repositoryPath.slice('YaRoute/'.length)}`;
    }
    return repositoryPath;
  }
}
