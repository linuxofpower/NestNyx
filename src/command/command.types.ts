export type CommandPhase = 'RESOLVE' | 'ACT' | 'VERIFY';

export type CommandRunStatus =
  | 'COMPLETE'
  | 'FAILED_RESOLVE'
  | 'FAILED_ACT'
  | 'FAILED_VERIFY'
  | 'PARTIAL_DIAGNOSTIC';

export type ResourceRef = {
  key: string;
  driveId?: string;
  rclonePath?: string;
  required: boolean;
  visible: boolean;
  verify?: {
    nonEmpty?: boolean;
    expectedName?: string;
    expectedDriveId?: string;
  };
};

export type ReadReceipt = {
  key: string;
  ok: boolean;
  transport: string;
  driveId?: string;
  rclonePath?: string;
  sha256?: string;
  bytes?: number;
  modifiedTime?: string;
  error?: string;
};

export type RenderReceipt = {
  key: string;
  ok: boolean;
  mode: 'exact' | 'summary' | 'hidden';
  bytes?: number;
  error?: string;
};

export type CommandPlan<T = unknown> = {
  command: string;
  resolvedAt: string;
  sources: ResourceRef[];
  payload: T;
};

export type CommandExecutionReceipt<T = unknown> = {
  command: string;
  status: CommandRunStatus;
  phase?: CommandPhase;
  error?: string;
  plan?: CommandPlan;
  result?: T;
  startedAt: string;
  finishedAt: string;
};
