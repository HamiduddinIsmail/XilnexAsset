import type { AssetMeta } from "@/lib/types";

const SEED: AssetMeta[] = [
  {
    recordId: "rec-laptop-7420",
    name: "Dell Latitude 7420 — Finance",
    serialNumber: "",
    extra: {
      Category: "Laptop",
      Location: "HQ / Finance",
      "Asset Tag": "IT-1042",
    },
  },
  {
    recordId: "rec-thinkpad-x1",
    name: "Lenovo ThinkPad X1 Carbon — Sales",
    serialNumber: "PF3K7L2",
    extra: {
      Category: "Laptop",
      Location: "HQ / Sales",
      "Asset Tag": "IT-0881",
    },
  },
  {
    recordId: "rec-elitedesk",
    name: "HP EliteDesk 800 G6 — Accounts",
    serialNumber: "",
    extra: {
      Category: "Desktop",
      Location: "HQ / Accounts",
      "Asset Tag": "IT-2210",
    },
  },
  {
    recordId: "rec-monitor-u27",
    name: "Dell UltraSharp U2720Q",
    serialNumber: "CN-0M3T6-74261",
    extra: {
      Category: "Monitor",
      Location: "HQ / Design",
      "Asset Tag": "IT-3302",
    },
  },
  {
    recordId: "rec-iphone-wh",
    name: "iPhone 14 — Warehouse",
    serialNumber: "",
    extra: {
      Category: "Phone",
      Location: "Warehouse A",
      "Asset Tag": "WH-014",
    },
  },
  {
    recordId: "rec-ipad-sales",
    name: "iPad Pro 11 — Field Sales",
    serialNumber: "",
    extra: {
      Category: "Tablet",
      Location: "Field",
      "Asset Tag": "SL-203",
    },
  },
  {
    recordId: "rec-zebra",
    name: "Zebra DS2208 barcode scanner",
    serialNumber: "ZBR23018445",
    extra: {
      Category: "Scanner",
      Location: "Warehouse A / Dock",
      "Asset Tag": "WH-088",
    },
  },
  {
    recordId: "rec-printer",
    name: "Brother HL-L2350DW",
    serialNumber: "",
    extra: {
      Category: "Printer",
      Location: "HQ / Print Room",
      "Asset Tag": "IT-4411",
    },
  },
  {
    recordId: "rec-switch",
    name: "Cisco Catalyst 2960 — Floor 2",
    serialNumber: "FCW2432L09K",
    extra: {
      Category: "Network",
      Location: "HQ / Comms closet",
      "Asset Tag": "NET-012",
    },
  },
  {
    recordId: "rec-projector",
    name: "Epson EB-2250U — Meeting Room A",
    serialNumber: "",
    extra: {
      Category: "AV",
      Location: "HQ / Meeting Room A",
      "Asset Tag": "AV-007",
    },
  },
  {
    recordId: "rec-ups",
    name: "APC Smart-UPS 1500VA",
    serialNumber: "",
    extra: {
      Category: "Power",
      Location: "HQ / Server room",
      "Asset Tag": "PWR-003",
    },
  },
  {
    recordId: "rec-rally",
    name: "Logitech Rally camera — Boardroom",
    serialNumber: "2148LZ0A8B8",
    extra: {
      Category: "AV",
      Location: "HQ / Boardroom",
      "Asset Tag": "AV-021",
    },
  },
];

type MockStore = {
  assets: AssetMeta[];
};

const globalStore = globalThis as typeof globalThis & {
  __assetSerialStore?: MockStore;
};

function store(): MockStore {
  if (!globalStore.__assetSerialStore) {
    globalStore.__assetSerialStore = {
      assets: SEED.map((asset) => ({
        ...asset,
        extra: { ...asset.extra },
      })),
    };
  }
  return globalStore.__assetSerialStore;
}

export function listMockAssets(): AssetMeta[] {
  return store().assets.map((asset) => ({
    ...asset,
    extra: { ...asset.extra },
  }));
}

export function updateMockSerial(recordId: string, serialNumber: string) {
  const asset = store().assets.find((item) => item.recordId === recordId);
  if (!asset) {
    throw new Error("Asset not found in the demo Asset Register.");
  }
  const previousSerial = asset.serialNumber;
  asset.serialNumber = serialNumber;
  return { asset: { ...asset, extra: { ...asset.extra } }, previousSerial };
}
