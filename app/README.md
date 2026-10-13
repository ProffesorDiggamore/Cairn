# Cairn

A note-taking app that feels like Notion and stores everything like Obsidian: every page is a plain
Markdown file in this GitHub repo. It runs on your Mac and your iPhone as an installed app, works offline,
and syncs automatically. It's free.

- **Notion-style editor:** type `/` for blocks (headings, to-dos, toggle lists, toggle headings, callouts,
  tables, code…), drag blocks with the handle, select text for the formatting toolbar.
- **Toggles:** a *Toggle list* hides text under an arrow; every heading has an arrow too, so a whole section
  folds away under its heading (⌘. folds the heading you're on, ⌘⌥T folds or opens them all).
- **Page icons:** pick an emoji, or make your own in *Make your own* — a symbol, letters, an emoji or a
  pixel drawing on a coloured shape — or upload a small picture.
- **Calendar:** the Calendar button shows your daily notes by month, the times written in them, and adds
  events to Google Calendar (or Apple Calendar with an .ics file). No account linking.
- **Little clocks:** times you type, like `Math 1-3` or `2:30pm`, get a tiny clock; click it to put that line
  on your calendar.
- **Screenshots:** paste a screenshot (⌘⇧⌃4) or drop a picture straight into a page.
- **Themes:** six colour palettes in light and dark, any accent colour, four fonts, text size, spacing and
  page width.
- **Obsidian-style vault:** `[[wikilinks]]` with autocomplete, backlinks, a graph view, folders,
  `> [!note]` callouts, `==highlights==`, tags, daily notes. The files stay normal Markdown you can open
  in Obsidian or any editor.
- **Automatic sync:** notes save on the device instantly, then sync with this repo a few seconds after you
  stop typing, when you open the app, and every 30 seconds. Edits made on two devices are merged line by
  line. If the same line was changed on both, your copy is kept as a separate "(conflict …)" page so
  nothing is lost.

The app's code lives in this `app/` folder. **Keep your notes in a separate private repo** (for example
`cairn-notes`) — not in this one. That way app updates and notes never mix, and nothing private can end up
in the website build. Cairn ignores `app/` (and anything starting with `.`) when it reads notes, so an
old setup that synced into this repo still works, but see *Moving your notes out of this repo* below.

---

## Put it online (one time, about 5 minutes, free)

Your phone needs a web address to install the app from. Netlify hosts it free, straight from this private
repo. Your notes are never part of the website: the site is only the app, and it reads your notes from
GitHub with a token that stays on each of your devices.

1. Make sure this repo's latest code is on `main` (it is, unless you're testing a branch).
2. **Make a free Netlify account** at <https://app.netlify.com/signup> and choose **Sign up with GitHub**.
   No credit card needed.
3. Click **Add new project → Import an existing project → GitHub**, allow access, and pick the
   **Cairn** repo.
4. Netlify reads the settings from `netlify.toml` in the repo, so you'll see *Base directory* `app`,
   *Build command* `npm run build` and *Publish directory* `app/dist` already filled in. Don't change
   anything; just click **Deploy**.
5. After about a minute you get a link like `https://wonderful-pebble-123.netlify.app`. That's your app.
   To pick a nicer name, open **Project configuration → Change project name** (for example
   `cairn-notes` → `https://cairn-notes.netlify.app`).

Every note you sync is a commit to this repo. `netlify.toml` tells Netlify to skip the build when a commit
doesn't change anything in `app/`, so syncing notes never uses up your free plan. Netlify only rebuilds
when the app itself is updated.

## Install it on your devices

**Mac (Safari):** open your link, then in the menu bar choose **File → Add to Dock…** → **Add**. Cairn now
opens in its own window from the Dock, Launchpad and Spotlight, like a normal app. The icon is just the
pebble with no tile behind it. If Safari puts it on a white square anyway, download
`/cairn-pebble.png` from **Settings → Install app → Download Dock icon** and choose it in the Cairn
window's **Cairn → Settings → General** (click the icon).
*(Chrome or Edge also work: click the install icon at the right end of the address bar.)*

**iPhone (Safari):** open your link, tap **Share** (on newer iOS it's inside the **•••** menu), choose
**Add to Home Screen**, keep **Open as Web App** on, and tap **Add**.

Apple charges $99/year to put apps in the App Store, and free developer installs expire every 7 days.
Installing from Safari like this costs nothing and never expires.

## Turn on sync (once per device)

1. **Make a notes repo (once).** Go to <https://github.com/new>, name it `cairn-notes`, choose **Private**,
   and click **Create repository**. This repo holds only your notes — never use the app repo for them.
2. Create a token at <https://github.com/settings/personal-access-tokens/new>:
   - Name: `Cairn`, any expiration (paste a new one when it runs out)
   - **Repository access → Only select repositories →** `ProffesorDiggamore/cairn-notes`
   - **Permissions → Repository permissions → Contents → Read and write**
3. In Cairn open **Settings → Sync**, enter `ProffesorDiggamore/cairn-notes`, leave the branch and folder
   empty, paste the token and press **Connect**.

The token is stored only on that device. It's sent to GitHub and nowhere else. Cairn warns you before
connecting to a **public** repo or to a repo that contains app code.

**Want notes inside a bigger repo anyway?** Fill in *Folder in the repo* (for example `notes`) and Cairn
reads and writes only that folder.

## Moving your notes out of this repo

If you first set Cairn up to sync into this app repo:

1. Create the private `cairn-notes` repo and a token for it (steps 1–2 above).
2. On one device that has all your notes, open **Settings → Sync → Change repo or token**, enter
   `ProffesorDiggamore/cairn-notes` and press **Save**. Cairn copies every note on that device into the new
   repo.
3. On your other devices, do the same — they'll pull the notes from the new repo.
4. Check the new repo on GitHub, then delete the old `.md` files from this repo yourself (GitHub keeps them
   in history, so treat anything sensitive that was ever here — like passwords — as seen, and change it).

---

## For developers

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # markdown, sync engine and vault tests
npm run typecheck
npm run build      # production build in dist/ (with offline service worker)
```

Stack: React 19, TipTap 3 (ProseMirror), Vite 8, vite-plugin-pwa, zustand, IndexedDB.

| Path | What it does |
| --- | --- |
| `src/lib/markdown/` | Markdown ⇄ editor document conversion (Obsidian flavour), round-trip tested |
| `src/lib/sync/` | GitHub sync over the Git Data API: one commit per sync, 3-way line merge, conflict copies |
| `src/lib/vault.ts` | Notes in memory + IndexedDB: create, rename (rewrites `[[links]]`), move, trash |
| `src/editor/` | The editor: slash menu, `[[` autocomplete, toolbars, drag handle, callouts, code blocks |
| `src/components/` | App shell: sidebar, pages, search palette, graph, settings, onboarding |
