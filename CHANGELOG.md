# Changelog

## 0.6.9

- Changed campaign synchronization to manual-only: Foundry no longer imports the public campaign source at world startup or on a background timer.
- Preserves Journal page edits and manually deleted managed Journals during ordinary play until the GM deliberately clicks **Sync now**.
- Stops quest progress, voting, and participation actions from rewriting manually edited Journal page content.
- Versioned the module script and stylesheet so Foundry cannot reuse the v0.6.8 automatic-sync code.

## 0.6.8

- Changed the default campaign source to the public GitHub `campaign.json`, allowing Lore, quest, and History content updates to arrive through **Sync now** without replacing the module folder.
- Automatically migrates worlds still using the old bundled campaign path while preserving any custom source URL chosen by the GM.
- Imports the corrected 1900s campaign primer as player-facing Lore and reduces History to Session 1: The Days of the First Steps.
- Versioned the module script and stylesheet so Foundry cannot reuse v0.6.7 browser assets.

## 0.6.7

- Fixed Foundry's `config.content element must have no attributes` error by keeping the DialogV2 outer content element completely plain.
- Moved all dossier importer styling to an inner wrapper and added validation to prevent the invalid structure from returning.

## 0.6.6

- Fixed the GitHub release validator so it checks the versioned module script declared by `module.json` instead of the retired stable filename.
- Reissued the cache-proof dossier importer as a complete installable Foundry release.

## 0.6.5

- Renamed the module script and stylesheet entrypoints so Foundry cannot reuse the cached 0.6.3 dossier importer after updating.
- Keeps the 0.6.4 `.json` drop-zone importer unchanged while forcing its interface assets to load from fresh URLs.

## 0.6.4

- Replaced the private dossier paste box and explanatory text with a compact `.json` file drop zone.
- Added click-to-browse and drag-and-drop dossier imports with selected-file feedback and clear invalid-file errors.

## 0.6.3

- Removed and explicitly retired the four unwanted demonstration quests again, leaving the First Steps festival and five campaign quest lines.
- Fixed private dossier identity so different Actor UUIDs owned by the same Foundry user receive separate private Journals.
- Added automatic migration for existing private Journals created before Actor-based dossier identity was available.
- Kept dossier reimports additive: the matching Actor dossier updates in place, other character dossiers remain separate, and Personal Notes remain untouched.
- Made User and Actor UUIDs optional so dossiers can be imported GM-only and assigned to players afterward without losing that ownership on reimport.

## 0.6.2

- Restored the four earlier quests alongside the First Steps festival and five new destination quest lines.
- Removed the active retirement instruction so this update adds to the journal instead of replacing quest content.
- Clarified that campaign updates are additive by default; records are removed only when their exact IDs are deliberately retired.

## 0.6.1

- Replaced the four demonstration quests with the campaign's opening chapter at Feyrandralis and the Cradle of Blooming Light.
- Added a full seven-day **Days of the First Steps** festival with one tracked objective for each festival day.
- Added five player-selectable quest lines leading toward Kaelport, Luthar's Gate, or deeper into Feyrandralis.
- Added explicit retirement support for obsolete module-managed records so the old demonstration quests are removed on the next GM sync without touching unrelated Journals.
- Kept player dossiers and character secrets outside the public campaign library.

## 0.6.0

- Added the full-resolution Kaeltharion world map as a dedicated **World Map** journal tab.
- Added smooth map panning, wheel/button zoom, reset controls, and a responsive map workspace.
- Added persistent GM-managed markers for places, quests, lore, dangers, people, and mysteries.
- Added marker information cards, optional links to managed Journal Entries, and GM controls to add, edit, move, or delete markers.
- Stored markers as world data so every connected player sees the same map annotations.
- Renamed the script and stylesheet for this feature release so Foundry cannot reuse cached v0.5 files.

## 0.5.1

- Renamed the Grand Blooming script and stylesheet so Foundry loads the redesigned blue theme and quest-ledger labels instead of reusing cached legacy files.
- Kept the v0.5.0 campaign wording, banner, quest ledger, lore, history, dossiers, and **J** shortcut unchanged.

## 0.5.0

- Reframed the journal as **The Grand Blooming** within **The Blue Butterfly Cycle**.
- Replaced the heavy framed quest board with the clean blue card language used by the Lore Library.
- Added an original Belle Époque floral-and-blue-butterfly banner with restrained Art Nouveau gold linework.
- Updated quest-board labels to period-inspired invitations, engagements, promises, and closed chapters.
- Preserved the campaign line: “A living record of promises, discoveries, and consequences.”
- Switched the permanent Foundry manifest address to GitHub's direct raw endpoint to avoid redirect-related fetch errors.

## 0.4.1

- Added an editable Foundry keybinding that opens the Campaign Journal with **J**.

## 0.4.0

- Added GM-imported private player dossiers resolved from Foundry User or Actor UUIDs.
- Added restricted per-player Journal ownership with no default player visibility.
- Added managed Backstory, What I Know, and individual knowledge pages.
- Added a player-editable Personal Notes page that is preserved during reimports.
- Added a conditional My Story tab for players and a Dossiers tab for GMs.
- Kept private dossier source out of the publicly fetched campaign library.
- Added a blank dossier-package template and secure authoring workflow.

## 0.3.0

- Added the fantasy-anime Butterfly Guild quest-board interface.
- Added one-choice-per-player voting for the party's next regular quest.
- Added dedicated New Postings, available choices, active, and resolved sections.
- Added personal quests with named owners and public join/leave rosters.
- Added synchronized player-to-GM quest-board actions through Foundry's module socket.
- Added original ebony, midnight-blue, gold, and butterfly quest-board artwork.
- Extended the campaign format with quest scope, owner, guild rank, new-posting, and posting-date fields.

## 0.2.0

- Redesigned the journal in black, midnight blue, sapphire, and antique gold.
- Added original blue-butterfly-and-gold-filigree header artwork.
- Added blue focus glows, gold typography, luminous quest states, and richer card depth.

## 0.1.0

- Added JSON-backed quest, lore, and campaign-history synchronization.
- Added player-facing dashboard with search and tabs.
- Added GM quest status and objective controls.
- Added automatic startup and interval synchronization.
- Added Foundry Journal Entry creation with player/GM visibility.
