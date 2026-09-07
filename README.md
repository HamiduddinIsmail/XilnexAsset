# Asset Serial Updater

A small web app for Xilnex staff to work Asset Register data in Lark Base without typing serials by hand.

After the PIN, you land on the **Asset Desk** and pick a tool:

1. **Asset Handover** — hand several assets (laptop, mouse, bag, …) to one person in a single confirm.
2. **Asset Return** — take assigned or loaned assets back into stock.
3. **Asset Maintenance** — move Open jobs to In Progress, then Completed.
4. **Serial Number Updater** — write a barcode or printed serial onto the matching Asset Register row.

Until a Base is connected, the app runs in **demo mode** against sample tables so you can try the flows immediately.

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

## Connect Lark Base (Admin)

Admins connect a Base from the app. No `.env` edit is required after that.

1. Open **Setup** (gear) on the scanner page, or go to `/setup`.
2. Paste:
   - **App ID** and **App Secret** from a Lark custom app
   - The **Lark Base link** copied from the browser while the Asset Register table is open
3. Tap **Test and save**. The app checks that it can read the table, then stores the connection on the server.

Every phone and desktop using this server then talks to that Base. Saving again replaces the connection for everyone.

Leave App ID and Secret blank if you only want to point at a different Base with the same app.

Saved credentials live in `data/lark-settings.json` (not committed). That file overrides `.env.local`.

### Custom App Checklist

Create a custom app in the [Lark Developer Console](https://open.larksuite.com/app) (or [Feishu](https://open.feishu.cn/app) if you use Feishu in China).

1. Copy **App ID** and **App Secret**.
2. Add a capability / permission for Base:
   - `base:record:retrieve` (search records)
   - `base:record:update` (update a record)
   - `base:record:create` (new Transaction Log rows on handover)
   - `base:field:create` (adds the Signature attachment column if it is missing)
   or the broader `bitable:app` scope, which also covers uploading the signature PNG.
3. Publish a version of the app so the scopes take effect.
4. In **Contacts permission** (not only app availability), set the range to **All employees**. Handover reads the company directory from this setting. Then publish a version of the app.
5. Open your Asset Register Base → **…** → **Add application** / collaborate, and grant the app **edit** access. The test fails if the app is not a collaborator.
6. Copy the browser URL while the Asset Register is open:

   `https://<tenant>.larksuite.com/base/<APP_TOKEN>?table=<TABLE_ID>`

   Wiki links (`/wiki/…`) are resolved automatically when possible.

The table is detected by the `table=` query, or by a name that looks like **Asset Register**. Field names are auto-detected (`Asset Name`, `Serial Number`, `SN`, `序列号`, …).

### Optional Env Fallback

You can still put credentials in `.env.local` (see `.env.example`). They are used only when no Setup save exists. Restart `npm run dev` after changing env vars.

Feishu China tenants should use a `feishu.cn` Base link (API host is inferred) or set:

```bash
LARK_API_BASE=https://open.feishu.cn
```

Anyone who can open `/setup` can change the connection. Run this app on a trusted network.

## Live Data Speed

Opening a desk talks to Lark (Asset Register plus, on Handover, the company directory). The first load after idle is the slow one. After that:

- The staff list is reused for 10 minutes (Refresh on Handover fetches it again).
- The Handover/Return asset list is reused for about 45 seconds. Completing a handover or return clears that snapshot so the next open shows the new assignee.
- Handover loads the register, recent transactions, and staff at the same time instead of one after another.

Tap **Refresh** on a desk when you need the live Base right now (new employee, asset just added in Lark).

## PIN Lock

The first visit opens a welcome screen. Create a **4-digit PIN**. After that, the link alone cannot read or change Lark data.

- Enter the PIN to unlock the asset desk (Handover, Return, Maintenance, Serials, and Setup) for 12 hours on that browser.
- Tap **Lock** in the header when you walk away.
- Change the PIN later in **Setup**.
- If the PIN is forgotten locally, delete `data/app-lock.json` and create a new one. On Netlify, delete the `app-lock` blob instead.

## Asset Handover

Open **Handover** in the header. This is the desk version of the old Lark Approval form — scan first, not a long dropdown of every asset.

You can hand several assets to the same person in one confirm (for example a laptop, mouse, and bag).

1. Pick **Handover To** from the company directory (search by name or email). If the list is short, the custom app’s **Contacts permission** is not set to all employees — change that in Lark Admin, publish a new app version, then Refresh.
2. Scan serials or tap assets to add them to the handover list. Repair, disposal, missing, spoiled, and trade-in stock cannot be handed over. Each line has its own condition (New, Good, or Fair).
3. Set shared details once: date, location, assignment type, and reason. Temporary assignments also ask for an expected return date.
4. Collect **one** employee signature for the whole list (QR on their phone, or Open on this screen). Review stays locked until they sign.
5. Review the changes and submit.

The app then, for **each** asset in the list:

- Sets **Current Assignee**, **Current Status** (`Assigned`, or `Loan` for temporary), **Location**, and **Asset Condition** on **1. Asset Register**
- Adds a row to **2. Transaction Log** with type **Handover**, **Transfer** (if someone already held it), or **Loan**, **Approval Status = Approved**, and **Assignment Status = Active**
- Uploads the signature PNG onto the **Signature** attachment field on that Transaction Log row (the same image is attached to every row in the batch). The desk creates this Attachment column if it is missing.

The signing QR session is only kept locally (`data/handover-signs.json`, or the Netlify `handover-signs` blob) until confirm. After Write to Lark, the Transaction Log attachment is the copy to use for acknowledgement PDFs later.

There is no Lark approval chain. The person at the desk is the handover.

## Asset Return

Open **Return** in the header. Filter by the person who holds the assets, or scan a serial. You can queue several assets and confirm once.

Return reason is one of four:

1. **Resignation** — clear Current Assignee and put the asset back to **Available**.
2. **Return for Repair** — keep Current Assignee. Status becomes **In Repair**. Opens a **Repair** job on **3. Maintenance Log**.
3. **Return for Upgrade** — keep Current Assignee. Status becomes **In Repair** until the upgrade is done. Opens an **Upgrade** job on Maintenance Log.
4. **Project End** — use this after a **Project Requirement** handover. Clear Current Assignee and put the asset back to **Available**.

Condition on return is **Good**, **Fair**, **Damaged**, or **Missing** (no Faulty).

If the reason is Repair or Upgrade, or the condition is **Damaged**, the desk also creates an Open maintenance job (Damaged uses Repair unless the reason is Upgrade). Damaged plus Resignation or Project End still clears the assignee and sets status to **In Repair**.

Collect **one** employee signature for the whole list (QR on their phone, or Open on this screen). Review stays locked until they sign.

The app then, for each asset:

- Writes a **Return** row on **2. Transaction Log** (**Assignment Status = Returned**, **Approval Status = Approved**)
- Attaches the signature PNG on the **Signature** field of that row
- Updates **Current Status**, **Location**, and **Asset Condition** on **1. Asset Register**
- Clears **Current Assignee** unless the reason is Repair or Upgrade
- Opens **3. Maintenance Log** when repair, upgrade, or damaged applies

## Maintenance Desk

Open **Maintenance** in the header. It lists **3. Maintenance Log** jobs that are **Open** or **In Progress**. Repair and Upgrade follow the same steps. Disposal can still be started and completed, but extra disposal fields are not collected yet.

1. Review Open jobs.
2. **Send to Repair** or **Send to Upgrade** — fill **Vendor / Technician** and **Maintenance Cost**. Status becomes **In Progress**, the asset is **In Repair**, and **Start Date** is set automatically.
3. **Mark Repair Complete** / **Mark Upgrade Complete** — fill **Repair Result / Action Taken** and choose **Asset Condition After Maintenance**. Status becomes **Completed**, that condition is written on the Maintenance Log and the asset, **Completion Date** is set automatically, and current status is **Available** if there is no Current Assignee (otherwise **Assigned**).

Disposal jobs can be started and completed the same way, without vendor, cost, or result. Completing disposal does not set the asset back to Available or Good.

If the asset has no serial yet, use the button on the job row instead of scanning.

## Scanning

- **Phone camera:** tap **Scan Barcode or Photo**. The viewfinder is large, and the app reads the full camera feed (not just a tiny crop). On phones that support it, use **Torch** and **Zoom**, or tap **Read This Frame** to decode a still at full resolution.
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
