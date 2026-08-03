import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

const manifest = await readJson("module.json");
const campaign = await readJson("content/campaign.json");
await readJson("content/schema.json");
const dossierTemplate = await readJson("examples/private-dossier-template.json");
if (!manifest.esmodules?.length || !manifest.styles?.length) throw new Error("module.json must register its script and stylesheet.");
await readFile(path.join(root, manifest.esmodules[0]), "utf8");
await readFile(path.join(root, manifest.styles[0]), "utf8");
const mapAsset = await readFile(path.join(root, "assets/world-map.webp"));
if (mapAsset.length < 100_000) throw new Error("The world map asset is missing or unexpectedly small.");

if (manifest.id !== path.basename(root)) throw new Error("module.json id must match the module folder name.");
if (campaign.schemaVersion !== 1) throw new Error("campaign.json must use schemaVersion 1.");
if (!campaign.campaign?.title) throw new Error("campaign.title is required.");
if (!Array.isArray(campaign.entries)) throw new Error("entries must be an array.");
if (campaign.retiredEntries !== undefined && !Array.isArray(campaign.retiredEntries)) throw new Error("retiredEntries must be an array.");
if (!Array.isArray(dossierTemplate.dossiers) || !dossierTemplate.dossiers.length) throw new Error("The private dossier template needs a dossiers array.");
for (const dossier of dossierTemplate.dossiers) {
  if ((!dossier.dossierId && !dossier.playerUuid) || !dossier.characterName || !dossier.backstory?.body) throw new Error("The private dossier template is incomplete.");
}

const allowedTypes = new Set(["quest", "lore", "history"]);
const ids = new Set();
for (const entry of campaign.entries) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id ?? "")) throw new Error(`Invalid entry id: ${entry.id ?? "missing"}.`);
  if (ids.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}.`);
  if (!allowedTypes.has(entry.type)) throw new Error(`Invalid type on ${entry.id}: ${entry.type}.`);
  if (!entry.title) throw new Error(`Missing title on ${entry.id}.`);
  if (entry.visibility && !["players", "gm"].includes(entry.visibility)) throw new Error(`Invalid visibility on ${entry.id}.`);
  if (entry.quest?.scope && !["party", "personal"].includes(entry.quest.scope)) throw new Error(`Invalid quest scope on ${entry.id}.`);
  ids.add(entry.id);

  const objectiveIds = new Set();
  for (const objective of entry.quest?.objectives ?? []) {
    if (!objective.id || !objective.text) throw new Error(`Invalid objective on ${entry.id}.`);
    if (objectiveIds.has(objective.id)) throw new Error(`Duplicate objective ${objective.id} on ${entry.id}.`);
    objectiveIds.add(objective.id);
  }
}
const retiredIds = new Set();
for (const entryId of campaign.retiredEntries ?? []) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entryId ?? "")) throw new Error(`Invalid retired entry id: ${entryId ?? "missing"}.`);
  if (retiredIds.has(entryId)) throw new Error(`Duplicate retired entry id: ${entryId}.`);
  if (ids.has(entryId)) throw new Error(`Entry ${entryId} cannot be active and retired.`);
  retiredIds.add(entryId);
}

const template = await readFile(path.join(root, "templates/dashboard.hbs"), "utf8");
for (const marker of ["data-lcj-panel=\"map\"", "data-lcj-map-viewport", "data-lcj-map-pin", "data-action=\"addMapPin\""]) {
  if (!template.includes(marker)) throw new Error(`The interactive map template is missing ${marker}.`);
}
const blocks = [];
const blockPattern = /{{([#/])\s*(if|unless|each)\b[^}]*}}/g;
for (const match of template.matchAll(blockPattern)) {
  const [, direction, name] = match;
  if (direction === "#") blocks.push(name);
  else if (blocks.pop() !== name) throw new Error(`Unbalanced Handlebars block near ${match[0]}.`);
}
if (blocks.length) throw new Error(`Unclosed Handlebars block: ${blocks.at(-1)}.`);

const stylesheet = await readFile(path.join(root, "styles/world-map-journal.css"), "utf8");
const openingBraces = [...stylesheet.matchAll(/{/g)].length;
const closingBraces = [...stylesheet.matchAll(/}/g)].length;
if (openingBraces !== closingBraces) throw new Error("The stylesheet has unbalanced braces.");
for (const match of stylesheet.matchAll(/url\(["']?(\.\.[^)"']+)["']?\)/g)) {
  await readFile(path.resolve(root, "styles", match[1]));
}

console.log(`Validated module manifest, private dossier template, UI template, stylesheet assets, and ${campaign.entries.length} campaign entries.`);
