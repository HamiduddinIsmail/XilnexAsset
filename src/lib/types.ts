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
