# Living Campaign Journal

Living Campaign Journal is a system-agnostic Foundry VTT module for a shared quest ledger, lore library, and campaign history. Its source of truth is one readable JSON file, so campaign updates can be authored with Codex and synchronized into Foundry without recreating Journal Entries by hand.

This first release targets Foundry VTT 13 and 14.

## Install from GitHub

Once a public GitHub release is available, paste this manifest URL into Foundry's **Install Module** dialog:

```text
https://github.com/hoeytherac/living-campaign-journal/releases/latest/download/module.json
```

For a private repository, download the release ZIP while signed in and install it manually in Foundry's `Data/modules/living-campaign-journal` directory. GitHub's unauthenticated manifest URL will not work until the repository is public.

## Visual design

The interface uses a near-black and midnight-blue foundation, luminous sapphire interactions, and antique-gold typography and rules. Its header artwork features original blue butterflies flowing around gold filigree. The player quest area is styled as a fantasy-anime guild board framed in ebony, blue leather, magical butterflies, and gold ornament.

## What it does

- Creates real Foundry Journal Entries under `Campaign Journal/Quests`, `Campaign Journal/Lore`, and `Campaign Journal/History`.
- Provides a searchable campaign dashboard from the Journal sidebar.
- Gives each player one vote for the regular quest they want the party to pursue next.
- Highlights newly posted quests separately from older available choices.
- Supports personal quests with an owner and a public join/leave roster so every ally can participate.
- Creates hidden player dossiers containing Backstory, What I Know, individual knowledge pages, and a preserved Personal Notes page.
- Shows player-visible and GM-only Journal Entries using normal Foundry permissions.
- Lets a GM advance quest statuses and tick objectives from the dashboard.
- Preserves quest progress when authored text is updated.
- Checks the configured JSON source when the world starts and, by default, every five minutes.
- Detects changed records by content, so incrementing `revision` is useful but not required.

## Install

1. Stop Foundry.
2. Extract the `living-campaign-journal` folder into Foundry's `{userData}/Data/modules` directory. The folder name must remain `living-campaign-journal`.
3. Start Foundry, open the world, and enable **Living Campaign Journal** under Manage Modules.
4. Press **J** anywhere in Foundry to open the Campaign Journal. You can also open the Journal sidebar and select **Campaign Journal**.

The first active GM automatically imports `content/campaign.json`.

## Player quest board

The **Quest Board** tab is the party's decision space:

- **New Postings** holds available quests marked with `new: true`.
- **Choose the Next Adventure** holds the other available party quests.
- A player selects **Choose this quest** to cast their vote. Selecting another regular quest moves that player's vote, so each player has one current destination choice.
- **Personal Quests** are tied to one hero but remain open to the table. Any player can select **Join this quest** or leave it later.
- **Current Adventures** and **Completed & Failed** keep the board connected to the campaign's ongoing record.

Player choices are sent through Foundry's module socket to the active GM, validated against Journal visibility, written to the quest's progress flags, and then synchronized to all connected players.

## Private player dossiers

Private dossiers are deliberately separate from `content/campaign.json`. Module assets and public JSON URLs can be requested by players, so private backstories and character-only information should never be placed there.

The secure workflow is:

1. Give Codex each player's Foundry User UUID and the backstory or ideas you want to develop. An Actor UUID also works if that Actor is assigned to the correct player.
2. Codex creates a private dossier package as a separate local JSON deliverable.
3. In Foundry, the GM opens the campaign journal and selects **Private dossiers**.
4. Paste the package and select **Import dossiers**.

Each player receives one private Foundry Journal owned only by that player. GMs can always see it. Everyone else receives no ownership permission. The importer creates or updates:

- **01 — Backstory**
- **02 — What I Know**, an index of character-only information
- One page for each piece of private knowledge
- **Personal Notes**, which is created once and preserved on future imports

Reimporting a dossier updates its managed pages without deleting old pages or overwriting Personal Notes. A blank formatting example is provided at [`examples/private-dossier-template.json`](examples/private-dossier-template.json).

The best identifier is a User UUID such as `User.abc123...`. You can get it by enabling Foundry's UUID display/copy tools or by using a simple console or macro expression such as `game.users.getName("Player Name").uuid`. Actor UUIDs such as `Actor.abc123...` are also accepted.

## The update loop

The bundled campaign source is [`content/campaign.json`](content/campaign.json). The easiest ongoing workflow is:

1. Tell Codex what changed. Refer to an existing record by its `id` when possible—for example: “Complete the first objective in `quest-bells-beneath-brackenford`, add what the party learned, and write Session 3 history.”
2. Codex edits and validates `content/campaign.json`, then makes a fresh module ZIP.
3. Replace the installed module folder with the new copy. Foundry imports changed records on the next check or when the GM clicks **Sync now**.

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
```

Hold Shift while clicking **Sync now** to refresh every managed Journal Entry. A forced refresh still preserves progress unless that entry has `resetProgress: true`.

## Data safety

Synchronization never deletes Journal Entries. It only creates or updates entries marked as managed by this module. Normal Foundry edits to quest progress are retained, but manual edits inside a managed Journal page can be replaced the next time that source record changes.

The source file is trusted GM-authored content. Do not point the module at an untrusted JSON feed because `body` intentionally supports HTML.

Foundry permissions protect the imported Journal Entries, but a bundled or publicly hosted JSON file is still a web asset. A technically curious player may be able to request that file directly. Do not place major unrevealed spoilers in an automatically fetched source unless access to that source is protected outside Foundry. The `gm` visibility option is useful for normal table organization, not as a security boundary for the source file.
