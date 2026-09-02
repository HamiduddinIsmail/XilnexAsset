export type ConnectionMode = "lark" | "demo";

export type AssetMeta = {
  recordId: string;
  name: string;
  serialNumber: string;
  extra: Record<string, string>;
};

export type AssetsPayload = {
  mode: ConnectionMode;
  tableName: string;
  nameField: string;
  serialField: string;
  assets: AssetMeta[];
  warning?: string;
};

export type UpdateSerialResult = {
  mode: ConnectionMode;
  recordId: string;
  name: string;
  previousSerial: string;
  serialNumber: string;
};

export type MaintenanceAction = "start" | "complete";

export type MaintenanceJob = {
  recordId: string;
  maintenanceId: string;
  type: string;
  status: string;
  priority: string;
  issue: string;
  assetRecordId: string;
  assetId: string;
  assetName: string;
  serialNumber: string;
  currentStatus: string;
  assetCondition: string;
  assignee: string;
  nextAction: MaintenanceAction | null;
};

export type MaintenancePayload = {
  mode: ConnectionMode;
  tableName: string;
  jobs: MaintenanceJob[];
  warning?: string;
};

export type MaintenanceAdvanceResult = {
  mode: ConnectionMode;
  action: MaintenanceAction;
  job: MaintenanceJob;
  summary: string;
  changes: string[];
};
