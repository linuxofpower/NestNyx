export type InitScope = 'local' | 'global';

export type InitInput = {
  target?: string;
  scope?: InitScope;
  sessionId?: string;
};

export type CoreRole = 'Head' | 'Body' | 'Footer';

export type CorePointer = {
  role: CoreRole;
  file: string;
  repositoryPath: string;
  driveId: string;
  status: string;
};

export type CommandTablePointer = {
  file: string;
  bundlePath: string;
  driveId: string;
  state: string;
};

export type AreaPointer = {
  area: string;
  rootId: string;
  manifestId: string;
  stateFolderId: string;
  stateId: string;
  configId: string;
};

export type ParsedPathsRegistry = {
  core: Record<CoreRole, CorePointer | undefined>;
  commandTable?: CommandTablePointer;
  areas: Record<string, AreaPointer>;
};

export type InitSession = {
  id: string;
  target?: string;
  scope: InitScope;
  createdAt: string;
  updatedAt: string;
  receipt: unknown;
};

export type InitReadiness = 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY';
