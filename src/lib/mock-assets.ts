import type { AssetMeta } from "@/lib/types";

const SEED: AssetMeta[] = [
  {
    recordId: "rec-laptop-7420",
    name: "Dell Latitude 7420 — Finance",
    serialNumber: "",
    extra: {
      Category: "Laptop",
      Location: "Penang HQ",
      "Asset Tag": "IT-1042",
      "Current Status": "Available",
      "Asset Condition": "Good",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-thinkpad-x1",
    name: "Lenovo ThinkPad X1 Carbon — Sales",
    serialNumber: "PF3K7L2",
    extra: {
      Category: "Laptop",
      Location: "Penang HQ",
      "Asset Tag": "IT-0881",
      "Current Status": "Assigned",
      "Asset Condition": "Good",
      "Current Assignee": "Alex Tan",
    },
  },
  {
    recordId: "rec-elitedesk",
    name: "HP EliteDesk 800 G6 — Accounts",
    serialNumber: "",
    extra: {
      Category: "Desktop",
      Location: "KL Office",
      "Asset Tag": "IT-2210",
      "Current Status": "Assigned",
      "Asset Condition": "Fair",
      "Current Assignee": "Priya Nair",
    },
  },
  {
    recordId: "rec-monitor-u27",
    name: "Dell UltraSharp U2720Q",
    serialNumber: "CN-0M3T6-74261",
    extra: {
      Category: "Monitor",
      Location: "Penang HQ",
      "Asset Tag": "IT-3302",
      "Current Status": "Available",
      "Asset Condition": "New",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-iphone-wh",
    name: "iPhone 14 — Warehouse",
    serialNumber: "",
    extra: {
      Category: "Phone",
      Location: "Vietnam",
      "Asset Tag": "WH-014",
      "Current Status": "Available",
      "Asset Condition": "Good",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-ipad-sales",
    name: "iPad Pro 11 — Field Sales",
    serialNumber: "",
    extra: {
      Category: "Tablet",
      Location: "Philippines",
      "Asset Tag": "SL-203",
      "Current Status": "Reserved",
      "Asset Condition": "Good",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-zebra",
    name: "Zebra DS2208 barcode scanner",
    serialNumber: "ZBR23018445",
    extra: {
      Category: "Scanner",
      Location: "Penang HQ",
      "Asset Tag": "WH-088",
      "Current Status": "In Repair",
      "Asset Condition": "Faulty",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-printer",
    name: "Brother HL-L2350DW",
    serialNumber: "",
    extra: {
      Category: "Printer",
      Location: "KL Office",
      "Asset Tag": "IT-4411",
      "Current Status": "Available",
      "Asset Condition": "Good",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-switch",
    name: "Cisco Catalyst 2960 — Floor 2",
    serialNumber: "FCW2432L09K",
    extra: {
      Category: "Network",
      Location: "Penang HQ",
      "Asset Tag": "NET-012",
      "Current Status": "Assigned",
      "Asset Condition": "Good",
      "Current Assignee": "Wei Ming",
    },
  },
  {
    recordId: "rec-projector",
    name: "Epson EB-2250U — Meeting Room A",
    serialNumber: "",
    extra: {
      Category: "AV",
      Location: "Penang HQ",
      "Asset Tag": "AV-007",
      "Current Status": "Available",
      "Asset Condition": "Fair",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-ups",
    name: "APC Smart-UPS 1500VA",
    serialNumber: "",
    extra: {
      Category: "Power",
      Location: "Penang HQ",
      "Asset Tag": "PWR-003",
      "Current Status": "Disposal",
      "Asset Condition": "Damaged",
      "Current Assignee": "",
    },
  },
  {
    recordId: "rec-rally",
    name: "Logitech Rally camera — Boardroom",
    serialNumber: "2148LZ0A8B8",
    extra: {
      Category: "AV",
      Location: "Penang HQ",
      "Asset Tag": "AV-021",
      "Current Status": "Available",
      "Asset Condition": "Good",
      "Current Assignee": "",
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

export function getMockAsset(recordId: string) {
  const asset = store().assets.find((item) => item.recordId === recordId);
  if (!asset) throw new Error("Asset not found in the demo Asset Register.");
  return { ...asset, extra: { ...asset.extra } };
}

export function updateMockAssignment(
  recordId: string,
  update: {
    assigneeName: string;
    status: string;
    location: string;
    condition: string;
  }
) {
  const asset = store().assets.find((item) => item.recordId === recordId);
  if (!asset) throw new Error("Asset not found in the demo Asset Register.");
  asset.extra = {
    ...asset.extra,
    "Current Assignee": update.assigneeName,
    "Current Status": update.status,
    Location: update.location,
    "Asset Condition": update.condition,
  };
  return { ...asset, extra: { ...asset.extra } };
}
