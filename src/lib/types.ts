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

export type HandoverPerson = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

export type HandoverAsset = {
  recordId: string;
  assetId: string;
  name: string;
  serialNumber: string;
  currentStatus: string;
  location: string;
  condition: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  blockedReason: string | null;
};

export type HandoverTransaction = {
  recordId: string;
  transactionId: string;
  type: string;
  assetName: string;
  staffName: string;
  location: string;
  assignmentType: string;
  status: string;
  effectiveDate: string;
};

export type HandoverOptions = {
  locations: string[];
  assignmentTypes: string[];
  reasons: string[];
  conditions: string[];
};

export type HandoverPayload = {
  mode: ConnectionMode;
  tableName: string;
  transactionTableName: string;
  assets: HandoverAsset[];
  people: HandoverPerson[];
  recent: HandoverTransaction[];
  options: HandoverOptions;
  peopleLimited: boolean;
  peopleHint?: string;
  warning?: string;
};

export type HandoverItemInput = {
  assetRecordId: string;
  condition: string;
};

export type HandoverSubmitInput = {
  items: HandoverItemInput[];
  staffId: string;
  requestedById?: string;
  location: string;
  assignmentType: string;
  reason: string;
  handoverDate: string;
  expectedReturnDate: string;
  remarks: string;
  acknowledged: boolean;
  signatureToken?: string;
};

export type HandoverResult = {
  mode: ConnectionMode;
  summary: string;
  changes: string[];
  transactionIds: string[];
  assets: HandoverAsset[];
};

export type ReturnOptions = {
  locations: string[];
  reasons: string[];
  conditions: string[];
};

export type ReturnPayload = {
  mode: ConnectionMode;
  tableName: string;
  transactionTableName: string;
  assets: HandoverAsset[];
  recent: HandoverTransaction[];
  options: ReturnOptions;
  warning?: string;
};

export type ReturnItemInput = {
  assetRecordId: string;
  reason: string;
  condition: string;
};

export type ReturnSubmitInput = {
  items: ReturnItemInput[];
  location: string;
  returnDate: string;
  remarks: string;
  acknowledged: boolean;
};

export type ReturnResult = {
  mode: ConnectionMode;
  summary: string;
  changes: string[];
  transactionIds: string[];
  assets: HandoverAsset[];
};
