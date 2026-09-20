import {
  AreaPointer,
  CommandTablePointer,
  CorePointer,
  CoreRole,
  ParsedPathsRegistry,
} from './init.types';

function clean(value: string) {
  return value.trim().replace(/^\`|\`$/g, '');
}

export function parsePathsRegistry(markdown: string): ParsedPathsRegistry {
  const core: Record<CoreRole, CorePointer | undefined> = {
    Head: undefined,
    Body: undefined,
    Footer: undefined,
  };
  const areas: Record<string, AreaPointer> = {};
  let commandTable: CommandTablePointer | undefined;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => clean(cell));

    if (cells.length >= 5 && ['Head', 'Body', 'Footer'].includes(cells[0])) {
      const role = cells[0] as CoreRole;
      if (!core[role] && /\.zip$/i.test(cells[1])) {
        core[role] = {
          role,
          file: cells[1],
          repositoryPath: cells[2],
          driveId: cells[3],
          status: cells[4],
        };
      }
      continue;
    }

    if (cells.length >= 5 && cells[0] === 'Yaro command table') {
      commandTable = {
        file: cells[1],
        bundlePath: cells[2],
        driveId: cells[3],
        state: cells[4],
      };
      continue;
    }

    if (
      cells.length >= 6 &&
      cells[0] &&
      cells[1] &&
      cells[2] &&
      cells[3] &&
      cells[4] &&
      cells[5] &&
      !['Area', '---'].includes(cells[0])
    ) {
      const looksLikeDriveId = (value: string) => /^[A-Za-z0-9_-]{20,}$/.test(value);
      if ([cells[1], cells[2], cells[3], cells[4], cells[5]].every(looksLikeDriveId)) {
        areas[cells[0]] = {
          area: cells[0],
          rootId: cells[1],
          manifestId: cells[2],
          stateFolderId: cells[3],
          stateId: cells[4],
          configId: cells[5],
        };
      }
    }
  }

  return { core, commandTable, areas };
}
