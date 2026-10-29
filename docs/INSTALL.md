# Install EZEapply

[Download the ready-to-load ZIP](https://github.com/dumpydon/EZEapply/releases/latest/download/EZEapply.zip). Use this download rather than GitHub’s **Code → Download ZIP**, which contains the developer source.

1. Open Downloads in Finder (or File Explorer).
2. Extract `EZEapply.zip`. On macOS, double-click it; on Windows, choose **Extract All**.
3. Move the extracted `EZEapply` folder to a permanent location of your choice. Chrome reads these files whenever the extension runs.
4. Open Chrome and enter `chrome://extensions` in its address bar.
5. Enable **Developer mode**, in the top-right corner.
6. Click **Load unpacked**. Select the extracted `EZEapply` folder — the one containing `manifest.json`. Select the folder, not the ZIP or an individual file.
7. Open Chrome’s puzzle-piece menu and pin EZEapply. Click its teal briefcase icon.
8. Open **Profile** to save your details. **Quick Access** opens the sidebar; **Add field** saves a reusable answer. AI is optional: configure your own provider in **AI settings**.

[Watch the 15-second illustrated film](media/install-ezeapply.mp4).

## If something does not work

- **“Manifest file is missing”**: the selected folder is incorrect. Open it and check that `manifest.json` is directly inside it.
- **The extension disappears or stops loading**: restore the extracted folder to its installed location. Don’t delete or move it after loading.
- **An already-open form is unchanged**: refresh that application tab after installing or reloading EZEapply.
- **Chrome will not allow access**: browser internal pages, the Chrome Web Store, and administrator-restricted environments cannot be filled. Check EZEapply’s site-access setting in Chrome.
- **A value is still blank**: use **Questions** to inspect the reason. A website may need a manual selection or a more specific saved answer. Use one-click copying as a fallback.
- **AI asks for a key**: your résumé is context, not an API credential. Choose a provider, save its key and select an available model in AI settings.

## Update without losing data

Export your profile and **Your fields** library before an update. Download the new ZIP, then replace the old folder’s contents in place. Click **Reload** on EZEapply at `chrome://extensions`, and refresh application tabs. Do not remove and reinstall the extension as an update; removing an extension can delete its local data. The public key in the build remains stable so in-place updates retain the extension ID.
