# Living Campaign Journal

Living Campaign Journal is a system-agnostic Foundry VTT module for a shared quest ledger, interactive world map, lore library, and campaign history. Its source of truth is one readable JSON file, so campaign updates can be authored with Codex and synchronized into Foundry without recreating Journal Entries by hand.

The current interface is styled for **The Grand Blooming**, a Belle Époque-inspired chapter of **The Blue Butterfly Cycle**, using clear layered blues, restrained antique gold, floral Art Nouveau details, and readable card-based layouts.

This first release targets Foundry VTT 13 and 14.

## Install from GitHub

Paste this direct manifest URL into Foundry's **Install Module** dialog:

```text
https://raw.githubusercontent.com/hoeytherac/living-campaign-journal/main/module.json
```

The direct raw address avoids the additional redirects used by GitHub release assets. Release ZIPs remain available for manual installation.

## Visual design

The interface uses a clear layered-blue foundation, luminous cornflower interactions, antique-gold typography, and open card-based layouts. Its original header artwork combines blue butterflies, wisteria, iris, hydrangea, and restrained Art Nouveau linework inspired by Belle Époque botanical programs.

## What it does

- Creates real Foundry Journal Entries under `Campaign Journal/Quests`, `Campaign Journal/Lore`, and `Campaign Journal/History`.
- Provides a searchable campaign dashboard from the Journal sidebar.
- Presents the complete world map in an interactive pan-and-zoom viewer.
- Lets the GM place shared map markers for places, quests, lore, dangers, people, and mysteries.
- Lets a marker display player-facing information and optionally open a linked campaign Journal Entry.
- Gives each player one vote for the regular quest they want the party to pursue next.
- Highlights newly posted quests separately from older available choices.
- Supports personal quests with an owner and a public join/leave roster so every ally can participate.
- Creates hidden player dossiers containing Backstory, What I Know, individual knowledge pages, and a preserved Personal Notes page.
- Shows player-visible and GM-only Journal Entries using normal Foundry permissions.
- Lets a GM advance quest statuses and tick objectives from the dashboard.
- Preserves quest progress when authored text is updated.
- Checks the configured JSON source when the world starts and, by default, every five minutes.
- Detects changed records by content, so incrementing `revision` is useful but not required.
- Removes only explicitly retired module-managed entries, allowing obsolete sample quests to be cleared without touching a GM's other Journals.

## Install

1. Stop Foundry.
2. Extract the `living-campaign-journal` folder into Foundry's `{userData}/Data/modules` directory. The folder name must remain `living-campaign-journal`.
3. Start Foundry, open the world, and enable **Living Campaign Journal** under Manage Modules.
4. Press **J** anywhere in Foundry to open the Campaign Journal. You can also open the Journal sidebar and select **Campaign Journal**.

The first active GM automatically imports `content/campaign.json`.

## Player quest ledger

The **Quest Ledger** tab is the party's decision space:

- **New Invitations** holds available quests marked with `new: true`.
- **Open Engagements** holds the other available party quests.
- A player selects **Choose this quest** to cast their vote. Selecting another regular quest moves that player's vote, so each player has one current destination choice.
- **Personal Promises** are tied to one hero but remain open to the table. Any player can select **Join this quest** or leave it later.
- **In Progress** and **Closed Chapters** keep the ledger connected to the campaign's ongoing record.

Player choices are sent through Foundry's module socket to the active GM, validated against Journal visibility, written to the quest's progress flags, and then synchronized to all connected players.

## Interactive world map

The **World Map** tab contains the full-resolution campaign map without modifying the underlying artwork. Drag the map to pan, use the mouse wheel or map controls to zoom, and select any marker to open its information card.

Map markers are stored as Foundry world data and automatically synchronize to connected players. Only GMs can change them:

1. Select **Add a pin**.
2. Click the desired position on the map.
3. Give the marker a title, choose an icon, and write the information players should see.
4. Optionally link the marker to an imported quest, lore, or history Journal Entry.

Existing markers can be edited, moved to a new position, or deleted from their information card. Marker descriptions are player-facing; do not put unrevealed GM secrets in them.

## Private player dossiers

Private dossiers are deliberately separate from `content/campaign.json`. Module assets and public JSON URLs can be requested by players, so private backstories and character-only information should never be placed there.

The secure workflow is:

1. Give Codex the backstory or ideas you want to develop. A Foundry User or Actor UUID is optional; omit it when you prefer to assign the dossier after import.
2. Codex creates a private dossier package as a separate local JSON deliverable.
3. In Foundry, the GM opens the campaign journal and selects **Private dossiers**.
4. Drop the `.json` package into the importer, or click the drop area to choose it, then select **Import JSON**.

Each imported character receives a private Foundry Journal. With a User or Actor UUID, it is immediately owned by that character's player. Without one, it remains GM-only until you assign Journal ownership in Foundry. The importer creates or updates:

- **01 — Backstory**
- **02 — What I Know**, an index of character-only information
- One page for each piece of private knowledge
- **Personal Notes**, which is created once and preserved on future imports

Reimporting a dossier updates its managed pages without deleting old pages or overwriting Personal Notes. A blank formatting example is provided at [`examples/private-dossier-template.json`](examples/private-dossier-template.json).

Each dossier has its own stable `dossierId`, so multiple characters remain separate even before assignment. Reimporting the same dossier updates only that character and preserves ownership assigned after import. Actor UUIDs remain supported when you want the importer to assign ownership automatically.

To assign later, right-click the imported private Journal in Foundry, open its ownership or permissions configuration, and give the correct player **Owner** access. User UUIDs such as `User.abc123...` and Actor UUIDs such as `Actor.abc123...` are still accepted for automatic assignment.

## The update loop

The bundled campaign source is [`content/campaign.json`](content/campaign.json). The easiest ongoing workflow is:

1. Tell Codex what changed. Refer to an existing record by its `id` when possible—for example: “Complete the first objective in `quest-bells-beneath-brackenford`, add what the party learned, and write Session 3 history.”
2. Codex edits and validates `content/campaign.json`, then makes a fresh module ZIP.
3. Replace the installed module folder with the new copy. Foundry imports changed records on the next check or when the GM clicks **Sync now**.

Campaign updates are additive by default. New records are appended, existing IDs are updated in place, and records remain available unless the GM explicitly asks to retire a specific ID.

For a hosted Foundry server, you can avoid replacing the whole module for content-only changes:

1. Put `campaign.json` at a stable HTTPS address that allows requests from your Foundry domain (CORS).
2. In Foundry's Configure Settings → Module Settings, set **Campaign JSON path** to that address.
3. Publish future edits to the same address. The active GM's background check imports them.

The default interval is five minutes. Set **Check for updates every (minutes)** to `0` to disable background checks.

## Authoring rules

Each entry needs:

- `id`: a permanent lowercase identifier such as `quest-fallen-observatory`.
- `type`: `quest`, `lore`, or `history`.
- `title`: the player-facing title.

Common optional fields are `summary`, `body`, `visibility`, `tags`, and `revision`.

- `body` accepts Foundry-friendly HTML.
- `visibility` is `players` by default; use `gm` for secret entries.
- Keep an entry's `id` unchanged after its first import. The ID is how updates find the correct Journal Entry.
- Changing any source field triggers an update even when `revision` is unchanged.
- Existing status and objective progress are preserved during content updates.
- Set `resetProgress` to `true` on a changed quest only when its imported default status and objective state should replace current progress. Remove it again after the reset is imported.
- Put an obsolete managed record's exact ID in top-level `retiredEntries` when it should be deleted from Foundry on the next sync. This only affects Journals created and managed by this module.

Quest-board fields live inside `quest`:

- `scope`: `party` for a normal destination choice or `personal` for a hero-focused quest.
- `owner`: the hero or character whose personal quest this is.
- `new`: `true` to place an available quest under New Postings; remove it or set it to `false` after the announcement period.
- `rank`: a guild-style difficulty label such as `C`, `B`, `A`, or `S`.
- `postedAt`: a short in-world or session-based posting date.

The complete machine-readable contract is [`content/schema.json`](content/schema.json).

## GM controls and API

Click a quest's status pill to advance through the configured status list. Click an objective to toggle it. Players see those GM-managed changes and can independently vote for available party quests or join personal quests.

For macros or another module:

```js
game.modules.get("living-campaign-journal").api.open();
await game.modules.get("living-campaign-journal").api.sync();
const pins = game.modules.get("living-campaign-journal").api.getMapPins();
await game.modules.get("living-campaign-journal").api.setMapPins(pins);
```

Hold Shift while clicking **Sync now** to refresh every managed Journal Entry. A forced refresh still preserves progress unless that entry has `resetProgress: true`.

## Data safety

Synchronization creates or updates entries marked as managed by this module. It deletes a managed Journal only when its exact source ID is explicitly listed in `retiredEntries`; unrelated and manually created Journals are never touched. Normal Foundry edits to quest progress are retained, but manual edits inside a managed Journal page can be replaced the next time that source record changes.

The source file is trusted GM-authored content. Do not point the module at an untrusted JSON feed because `body` intentionally supports HTML.

Foundry permissions protect the imported Journal Entries, but a bundled or publicly hosted JSON file is still a web asset. A technically curious player may be able to request that file directly. Do not place major unrevealed spoilers in an automatically fetched source unless access to that source is protected outside Foundry. The `gm` visibility option is useful for normal table organization, not as a security boundary for the source file.
