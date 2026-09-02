# Asset serial updater

A small web app for writing asset serial numbers into a Lark Base **Asset Register** without typing them by hand.

1. Search and select the asset (loaded from Lark Base).
2. Scan a barcode / QR code with the camera, take a photo of a printed serial, or use a USB / Bluetooth scanner.
3. Review the value, then submit. The app updates only that record’s serial field.

Until a Base is connected, the app runs in **demo mode** against a sample Asset Register so you can try the flow immediately.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Deploy to Netlify

This is a Next.js app. Netlify detects that and runs the OpenNext adapter automatically.

1. Put the project on GitHub, GitLab, or Bitbucket. If this Cursor project has no GitHub repo yet, click **Create repo**, then connect that repo.
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project** and pick the repo.
3. Leave the defaults (`npm run build`, publish `.next`, Node 22 from `netlify.toml`).
4. Click **Deploy**.
5. Open `https://<site>.netlify.app`. Create the 4-digit PIN, then **Setup** with App ID, App Secret, and the Lark Base link.

HTTPS on Netlify is what the phone camera needs. PIN and Lark settings are stored in Netlify Blobs (not in git), so they survive deploys.

You do **not** have to paste secrets into Netlify environment variables unless you want a fallback. Optional env names are in `.env.example`.

If you forget the PIN on Netlify, unlock is impossible until you delete the `app-lock` blob in **Site configuration → Blobs** (store `xilnex-asset-app`) and create a new PIN.

## Connect Lark Base (admin)

## Connect Lark Base (admin)

Admins connect a Base from the app. No `.env` edit is required after that.

1. Open **Setup** (gear) on the scanner page, or go to `/setup`.
2. Paste:
   - **App ID** and **App Secret** from a Lark custom app
   - The **Lark Base link** copied from the browser while the Asset Register table is open
3. Tap **Test and save**. The app checks that it can read the table, then stores the connection on the server.

Every phone and desktop using this server then talks to that Base. Saving again replaces the connection for everyone.

Leave App ID and Secret blank if you only want to point at a different Base with the same app.

Saved credentials live in `data/lark-settings.json` (not committed). That file overrides `.env.local`.

### Custom app checklist

Create a custom app in the [Lark Developer Console](https://open.larksuite.com/app) (or [Feishu](https://open.feishu.cn/app) if you use Feishu in China).

1. Copy **App ID** and **App Secret**.
2. Add a capability / permission for Base:
   - `base:record:retrieve` (search records)
   - `base:record:update` (update a record)  
   or the broader `bitable:app` scope.
3. Publish a version of the app so the scopes take effect.
4. Open your Asset Register Base → **…** → **Add application** / collaborate, and grant the app **edit** access. The test fails if the app is not a collaborator.
5. Copy the browser URL while the Asset Register is open:

   `https://<tenant>.larksuite.com/base/<APP_TOKEN>?table=<TABLE_ID>`

   Wiki links (`/wiki/…`) are resolved automatically when possible.

The table is detected by the `table=` query, or by a name that looks like **Asset Register**. Field names are auto-detected (`Asset Name`, `Serial Number`, `SN`, `序列号`, …).

### Optional env fallback

You can still put credentials in `.env.local` (see `.env.example`). They are used only when no Setup save exists. Restart `npm run dev` after changing env vars.

Feishu China tenants should use a `feishu.cn` Base link (API host is inferred) or set:

```bash
LARK_API_BASE=https://open.feishu.cn
```

Anyone who can open `/setup` can change the connection. Run this app on a trusted network.

## PIN lock

The first visit opens a welcome screen. Create a **4-digit PIN**. After that, the link alone cannot read or change Lark data.

- Enter the PIN to unlock Serials, Maintenance, and Setup for 12 hours on that browser.
- Tap **Lock** in the header when you walk away.
- Change the PIN later in **Setup**.
- If the PIN is forgotten locally, delete `data/app-lock.json` and create a new one. On Netlify, delete the `app-lock` blob instead.

## Maintenance desk

Open **Maintenance** in the header. It lists **3. Maintenance Log** jobs that are **Open** or **In Progress**.

1. Review Open jobs (repair or disposal).
2. When you send the asset out, scan its serial (or tap **Send to repair**). Status becomes **In Progress**, and a repair job sets the asset to **In Repair**.
3. When the repair is done, scan the same serial. Status becomes **Completed**, condition after maintenance is **Good**, the asset condition is **Good**, and current status is **Available** if there is no Current Assignee (otherwise **Assigned**).

Disposal jobs can be started and completed the same way, but completing disposal does not set the asset back to Available or Good.

If the asset has no serial yet, use the button on the job row instead of scanning.

## Scanning

- **Phone camera:** tap **Scan barcode or photo**. The viewfinder is large, and the app reads the full camera feed (not just a tiny crop). On phones that support it, use **Torch** and **Zoom**, or tap **Read this frame** to decode a still at full resolution.
- **Photo of a printed serial:** take or upload a picture. If there is no barcode, the app boosts contrast and reads the text.
- **USB / Bluetooth wedge scanner:** select an asset, then scan. The scanner types the value into the app automatically.

Submit is blocked if another asset already has that serial.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 43123 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
