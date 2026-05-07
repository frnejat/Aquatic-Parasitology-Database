# Aquatic Parasitology Database

A lightweight browser-based database manager with:

- Multiple tabs/pages
- Custom columns and rows
- Cross-page auto-fill rules
- CSV, TXT, and pasted spreadsheet import
- Typed and suggested column filters
- Global search across the current grid
- Bulk row selection, duplication, and deletion
- Sort by any column
- Export selected rows or filtered rows to CSV
- Save/load the whole database as a portable JSON file
- Optional Supabase cloud sync across browsers
- Per-page change tracking for grid edits
- Pagination controls for larger row sets
- Local persistence with `localStorage`

## Run Locally

Open [index.html](C:\Users\farsh\Documents\database\index.html) in a browser.

## Save Across Browsers

`localStorage` only saves inside the browser where you edited the database. If you want to open the same data in a different browser, use:

- `Save database file`
- `Load database file`

That exports/imports the whole database as JSON so the same tabs, rows, columns, and settings can be moved between browsers.

## Supabase Setup

This project can now sync the whole database to Supabase so the same data appears in any browser.

The admin PIN can also be shared through Supabase, so if cloud sync is configured you only need to set it once.

### 1. Create a Supabase project

Create a project in Supabase, then open:

- `Project Settings -> API`
- copy your `Project URL`
- copy your `publishable key` or `anon key`

Do not use the `service_role` or secret key in this frontend app.

### 2. Create the table

Open the SQL Editor in Supabase and run:

- [supabase-setup.sql](C:\Users\farsh\Documents\database\supabase-setup.sql)

This creates a table called `app_workspaces` that stores the whole app state.
It also adds that table to Supabase Realtime so browser-to-browser updates can appear automatically.

If you already created the table earlier, run this too:

```sql
alter table public.app_workspaces
add column if not exists admin_pin text;
```

And if your project was created before realtime sync was added, run this too:

```sql
do $$
begin
  alter publication supabase_realtime add table public.app_workspaces;
exception
  when duplicate_object then null;
end $$;
```

### 3. Add your Supabase details

Open:

- [supabase-config.js](C:\Users\farsh\Documents\database\supabase-config.js)

Fill in:

- `url`
- `publishableKey`
- `workspaceId`

Example:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  publishableKey: "YOUR_PUBLISHABLE_KEY",
  workspaceId: "aquatic-parasitology-main",
  autoSync: true,
};
```

### 4. Upload the app

Upload these files to your web host:

- [index.html](C:\Users\farsh\Documents\database\index.html)
- [app.js](C:\Users\farsh\Documents\database\app.js)
- [styles.css](C:\Users\farsh\Documents\database\styles.css)
- [supabase-config.js](C:\Users\farsh\Documents\database\supabase-config.js)

You do not upload the SQL file to the site. You run it once inside Supabase.

Any static host works well, for example:

- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages

### 5. Use cloud sync

When `supabase-config.js` is filled in, the app will:

- load the workspace from Supabase on startup
- save changes back to Supabase automatically
- listen for realtime updates from other open browsers
- show sync status in the `Cloud` menu

If the cloud workspace is empty, the app will upload your current local data first.

## Important Note About Security

The included SQL policy is simple so you can get started quickly with a static app. Anyone who has your project URL, browser key, and `workspaceId` can access that workspace.

For a private production deployment, the next step would be adding Supabase Auth and row-level policies tied to logged-in users.

## Import as a New Page

1. Enter a page name, or leave it blank to use the file name.
2. Use the file picker above the table to choose a `.csv` or `.txt` file.
3. Leave `Imported file has a header row` checked if the first row contains column names.
4. Click `Import file as new page`.
5. A new page is created with columns and rows from the import.

## Paste from Excel

1. Enter a page name, or leave it blank to use `Imported Page`.
2. Copy rows from Excel or another spreadsheet.
3. Paste them into the import box above the table.
4. Turn on `First pasted row is a header` if your copied range includes column names.
5. Click `Import paste as new page`.

## Filtering

Use the filter list at the top of any column to pick one of that column's existing values. You can combine filters across multiple columns, and `Clear filters` resets them without changing saved rows.

## Example automation

1. Create a `Contacts` page with `Client ID` and `Client Name`.
2. Create a `Projects` page with `Client ID` and `Client Name`.
3. On `Projects`, add an automation:
   - Source page: `Contacts`
   - Source match field: `Client ID`
   - Current page match field: `Client ID`
   - Source value field: `Client Name`
   - Target field: `Client Name`

Now when a project row has a matching `Client ID`, the `Client Name` is filled in automatically from `Contacts`.
