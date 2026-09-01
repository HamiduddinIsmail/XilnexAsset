# Asset serial updater

A small web app for writing asset serial numbers into a Lark Base **Asset Register** without typing them by hand.

1. Search and select the asset (loaded from Lark Base).
2. Scan a barcode / QR code with the camera, take a photo of a printed serial, or use a USB / Bluetooth scanner.
3. Review the value, then submit. The app updates only that record’s serial field.

Until Lark credentials are added, the app runs in **demo mode** against a sample Asset Register so you can try the flow immediately.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Connect Lark Base

Create a custom app in the [Lark Developer Console](https://open.larksuite.com/app) (or [Feishu](https://open.feishu.cn/app) if you use Feishu in China).

1. Copy **App ID** and **App Secret**.
2. Add a capability / permission for Base:
   - `base:record:retrieve` (search records)
   - `base:record:update` (update a record)  
   or the broader `bitable:app` scope.
3. Publish a version of the app so the scopes take effect.
4. Open your Asset Register Base → **…** → **Add application** / collaborate, and grant the app **edit** access. API calls fail if the app is not a collaborator.
5. Copy the Base token from the URL:

   `https://<tenant>.larksuite.com/base/<APP_TOKEN>?table=<TABLE_ID>`

   If the Base lives in Wiki, open the Base itself (not the wiki page) and copy the `/base/` token, or set `LARK_APP_TOKEN` to the wiki token (`wik…`) and the app will resolve it.

Put those values in `.env.local`:

```bash
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_APP_TOKEN=basxxx
LARK_TABLE_NAME=Asset Register
LARK_ASSET_NAME_FIELD=Asset Name
LARK_SERIAL_NUMBER_FIELD=Serial Number
```

`LARK_TABLE_ID` is optional if the table is named **Asset Register**. Field names are optional too: the app looks for common names such as `Asset Name`, `Serial Number`, `SN`, `序列号`.

Feishu China tenants should set:

```bash
LARK_API_BASE=https://open.feishu.cn
```

Restart `npm run dev` after changing env vars.

## Scanning

- **Phone camera:** tap **Scan barcode or photo**, point at Code 128, Code 39, QR, EAN, UPC, Data Matrix, or PDF417.
- **Photo of a printed serial:** take or upload a picture. If there is no barcode, the app reads the text and offers candidates.
- **USB / Bluetooth wedge scanner:** select an asset, then scan. The scanner types the value into the app automatically.

Submit is blocked if another asset already has that serial.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 43123 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
