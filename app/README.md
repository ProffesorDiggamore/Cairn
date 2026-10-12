# Cairn

A note-taking app that feels like Notion and stores everything like Obsidian: every page is a plain
Markdown file in this GitHub repo. It runs on your Mac and your iPhone as an installed app, works offline,
and syncs automatically. It's free.

- **Notion-style editor:** type `/` for blocks (headings, to-dos, callouts, tables, code…), drag blocks
  with the handle, select text for the formatting toolbar, give pages emoji icons.
- **Obsidian-style vault:** `[[wikilinks]]` with autocomplete, backlinks, a graph view, folders,
  `> [!note]` callouts, `==highlights==`, tags, daily notes. The files stay normal Markdown you can open
  in Obsidian or any editor.
- **Automatic sync:** notes save on the device instantly, then sync with this repo a few seconds after you
  stop typing, when you open the app, and every 30 seconds. Edits made on two devices are merged line by
  line. If the same line was changed on both, your copy is kept as a separate "(conflict …)" page so
  nothing is lost.

The app's code lives in this `app/` folder. Cairn ignores this folder (and anything starting with `.`)
when it reads your notes.

---

## Put it online (one time, about 5 minutes, free)

Your phone needs a web address to install the app from. Netlify hosts it free, straight from this private
repo. Your notes are never part of the website: the site is only the app, and it reads your notes from
GitHub with a token that stays on each of your devices.

1. **Get this code onto `main`.** Merge the `claude/inspiring-volta-ecp48g` branch into `main` on GitHub
   (or ask Claude to open the pull request for you).
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
opens in its own window from the Dock, Launchpad and Spotlight, like a normal app.
*(Chrome or Edge also work: click the install icon at the right end of the address bar.)*

**iPhone (Safari):** open your link, tap **Share** (on newer iOS it's inside the **•••** menu), choose
**Add to Home Screen**, keep **Open as Web App** on, and tap **Add**.

Apple charges $99/year to put apps in the App Store, and free developer installs expire every 7 days.
Installing from Safari like this costs nothing and never expires.

## Turn on sync (once per device)

1. Create a token at <https://github.com/settings/personal-access-tokens/new>:
   - Name: `Cairn`, any expiration (paste a new one when it runs out)
   - **Repository access → Only select repositories →** `ProffesorDiggamore/Cairn`
   - **Permissions → Repository permissions → Contents → Read and write**
2. In Cairn open **Settings → Sync**, enter `ProffesorDiggamore/Cairn`, leave the branch empty, paste the
   token and press **Connect**.

The token is stored only on that device. It's sent to GitHub and nowhere else.

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
