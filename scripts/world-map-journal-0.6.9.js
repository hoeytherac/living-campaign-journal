// Versioned entrypoint prevents Foundry and the browser from reusing an older module script.
const MODULE_ID = "living-campaign-journal";
const MODULE_TITLE = "Living Campaign Journal";
const BUNDLED_SOURCE_PATH = `modules/${MODULE_ID}/content/campaign.json`;
const DEFAULT_SOURCE_PATH = "https://raw.githubusercontent.com/hoeytherac/living-campaign-journal/main/content/campaign.json";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const WORLD_MAP_PATH = `modules/${MODULE_ID}/assets/world-map.webp`;
const MAP_PIN_TYPES = Object.freeze({
  location: { label: "Place", iconClass: "fa-solid fa-location-dot", color: "#54b8ff" },
  quest: { label: "Quest", iconClass: "fa-solid fa-scroll", color: "#f1dca0" },
  lore: { label: "Lore", iconClass: "fa-solid fa-book-open", color: "#bd9cff" },
  danger: { label: "Danger", iconClass: "fa-solid fa-triangle-exclamation", color: "#e87882" },
  person: { label: "Person", iconClass: "fa-solid fa-user", color: "#77ddba" },
  mystery: { label: "Mystery", iconClass: "fa-solid fa-sparkles", color: "#9ed9ff" }
});

let journalApp;

function info(message) {
  ui.notifications?.info(`${MODULE_TITLE}: ${message}`);
}

function warn(message) {
  ui.notifications?.warn(`${MODULE_TITLE}: ${message}`);
}

function error(message) {
  console.error(`${MODULE_TITLE} | ${message}`);
  ui.notifications?.error(`${MODULE_TITLE}: ${message}`);
}

function activeGmId() {
  if (game.users?.activeGM?.id) return game.users.activeGM.id;
  return game.users
    ?.filter((user) => user.active && user.isGM)
    .sort((left, right) => left.id.localeCompare(right.id))[0]?.id;
}

function isPrimaryGm() {
  return game.user?.isGM && game.user.id === activeGmId();
}

function flag(document, key) {
  return document.getFlag(MODULE_ID, key);
}

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function plainText(value = "") {
  const element = document.createElement("div");
  element.innerHTML = String(value);
  return element.textContent?.trim() ?? "";
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeMapPin(pin) {
  if (!pin || typeof pin !== "object") return null;
  const type = MAP_PIN_TYPES[pin.type] ? pin.type : "location";
  const title = String(pin.title ?? "").trim();
  if (!pin.id || !title) return null;
  return {
    id: String(pin.id),
    title,
    description: String(pin.description ?? "").trim(),
    type,
    x: clamp(Number(pin.x) || 0, 0, 100),
    y: clamp(Number(pin.y) || 0, 0, 100),
    journalUuid: String(pin.journalUuid ?? "").trim()
  };
}

function currentMapPins() {
  const stored = game.settings.get(MODULE_ID, "mapPins") ?? {};
  const pins = Array.isArray(stored) ? stored : stored.pins;
  return (Array.isArray(pins) ? pins : []).map(normalizeMapPin).filter(Boolean);
}

function mapPinView(pin) {
  const type = MAP_PIN_TYPES[pin.type];
  return {
    ...pin,
    typeLabel: type.label,
    iconClass: type.iconClass,
    color: type.color,
    hasJournalLink: Boolean(pin.journalUuid)
  };
}

function newMapPinId() {
  return foundry.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.() ?? `pin-${Date.now().toString(36)}`;
}

function mapPinTypeOptions(selectedType) {
  return Object.entries(MAP_PIN_TYPES)
    .map(([value, type]) => `<option value="${value}"${value === selectedType ? " selected" : ""}>${escapeHtml(type.label)}</option>`)
    .join("");
}

function mapJournalOptions(selectedUuid) {
  const entries = managedEntries().sort((left, right) => left.name.localeCompare(right.name));
  return [
    '<option value="">No linked journal entry</option>',
    ...entries.map((entry) => `<option value="${escapeHtml(entry.uuid)}"${entry.uuid === selectedUuid ? " selected" : ""}>${escapeHtml(entry.name)}</option>`)
  ].join("");
}

async function openMapPinEditor(pin = null, coordinates = null) {
  const { DialogV2 } = foundry.applications.api;
  const draft = pin ?? {
    title: "",
    description: "",
    type: "location",
    x: coordinates?.x ?? 50,
    y: coordinates?.y ?? 50,
    journalUuid: ""
  };
  const formData = await DialogV2.input({
    window: { title: pin ? `Edit map pin: ${pin.title}` : "Add a map pin" },
    content: `<div class="lcj-map-pin-form">
      <label><span>Pin title</span><input type="text" name="mapPinTitle" value="${escapeHtml(draft.title)}" placeholder="The place, person, or discovery" required autofocus></label>
      <label><span>Icon</span><select name="mapPinType">${mapPinTypeOptions(draft.type)}</select></label>
      <label><span>Information shown to players</span><textarea name="mapPinDescription" rows="6" placeholder="What the party knows about this marker">${escapeHtml(draft.description)}</textarea></label>
      <label><span>Linked journal entry (optional)</span><select name="mapPinJournalUuid">${mapJournalOptions(draft.journalUuid)}</select></label>
      <p><i class="fa-solid fa-circle-info"></i> Map pins are player-facing. Keep unrevealed GM secrets out of their descriptions.</p>
    </div>`,
    ok: { label: pin ? "Save pin" : "Place pin", icon: "fa-solid fa-map-pin" },
    modal: true,
    rejectClose: false
  });
  if (!formData) return null;
  const title = formData.mapPinTitle?.trim();
  if (!title) throw new Error("A map pin needs a title.");
  return normalizeMapPin({
    id: pin?.id ?? newMapPinId(),
    title,
    description: formData.mapPinDescription ?? "",
    type: formData.mapPinType,
    x: pin?.x ?? draft.x,
    y: pin?.y ?? draft.y,
    journalUuid: formData.mapPinJournalUuid ?? ""
  });
}

async function saveMapPins(pins) {
  if (!game.user.isGM) throw new Error("Only a GM can change map pins.");
  const normalized = pins.map(normalizeMapPin).filter(Boolean);
  await game.settings.set(MODULE_ID, "mapPins", { schemaVersion: 1, pins: normalized });
  return normalized;
}

function hashSource(value) {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateLibrary(library) {
  if (!library || typeof library !== "object") throw new Error("The source file must contain a JSON object.");
  if (library.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion: ${library.schemaVersion ?? "missing"}.`);
  if (!library.campaign?.title) throw new Error("campaign.title is required.");
  if (!Array.isArray(library.entries)) throw new Error("entries must be an array.");
  if (library.retiredEntries !== undefined && !Array.isArray(library.retiredEntries)) {
    throw new Error("retiredEntries must be an array when provided.");
  }

  const seen = new Set();
  const allowedTypes = new Set(["quest", "lore", "history"]);
  for (const [index, entry] of library.entries.entries()) {
    if (!entry?.id || typeof entry.id !== "string") throw new Error(`entries[${index}].id is required.`);
    if (seen.has(entry.id)) throw new Error(`Duplicate entry id: ${entry.id}.`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) throw new Error(`Entry id "${entry.id}" must use lowercase letters, numbers, and hyphens.`);
    if (!allowedTypes.has(entry.type)) throw new Error(`Entry "${entry.id}" has invalid type "${entry.type}".`);
    if (!entry.title) throw new Error(`Entry "${entry.id}" needs a title.`);
    if (entry.visibility && !["players", "gm"].includes(entry.visibility)) {
      throw new Error(`Entry "${entry.id}" has invalid visibility "${entry.visibility}".`);
    }
    if (entry.quest?.scope && !["party", "personal"].includes(entry.quest.scope)) {
      throw new Error(`Entry "${entry.id}" has invalid quest scope "${entry.quest.scope}".`);
    }
    seen.add(entry.id);
  }
  const retired = new Set();
  for (const entryId of library.retiredEntries ?? []) {
    if (typeof entryId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entryId)) {
      throw new Error(`Retired entry id "${entryId}" must use lowercase letters, numbers, and hyphens.`);
    }
    if (retired.has(entryId)) throw new Error(`Duplicate retired entry id: ${entryId}.`);
    if (seen.has(entryId)) throw new Error(`Entry "${entryId}" cannot be both active and retired.`);
    retired.add(entryId);
  }
  return library;
}

async function loadLibrary() {
  const sourcePath = game.settings.get(MODULE_ID, "sourcePath") || DEFAULT_SOURCE_PATH;
  const separator = sourcePath.includes("?") ? "&" : "?";
  const response = await fetch(`${sourcePath}${separator}lcj=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${sourcePath} (${response.status}).`);
  return validateLibrary(await response.json());
}

function desiredOwnership(entry, existing) {
  const current = existing ? foundry.utils.deepClone(existing.ownership) : {};
  const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  current.default = entry.visibility === "gm" ? levels.NONE : levels.OBSERVER;
  return current;
}

function defaultProgress(entry) {
  const objectives = Object.fromEntries((entry.quest?.objectives ?? []).map((objective) => [objective.id, false]));
  return {
    status: entry.quest?.status ?? "available",
    objectives,
    selectedBy: [],
    participants: []
  };
}

function mergedProgress(entry, existingProgress) {
  if (!existingProgress || entry.resetProgress === true) return defaultProgress(entry);
  const objectives = {};
  for (const objective of entry.quest?.objectives ?? []) {
    objectives[objective.id] = Boolean(existingProgress.objectives?.[objective.id]);
  }
  return {
    status: existingProgress.status ?? entry.quest?.status ?? "available",
    objectives,
    selectedBy: Array.isArray(existingProgress.selectedBy) ? existingProgress.selectedBy : [],
    participants: Array.isArray(existingProgress.participants) ? existingProgress.participants : []
  };
}

function folderLabel(type) {
  return ({ quest: "Quests", lore: "Lore", history: "History" })[type] ?? "Journal";
}

async function findOrCreateFolder(name, parent = null) {
  let folder = game.folders.find((candidate) =>
    candidate.type === "JournalEntry"
    && candidate.name === name
    && (candidate.folder?.id ?? candidate.folder ?? null) === (parent?.id ?? null)
  );
  if (folder) return folder;

  folder = await Folder.create({
    name,
    type: "JournalEntry",
    folder: parent?.id ?? null,
    flags: { [MODULE_ID]: { managed: true } }
  });
  return folder;
}

async function ensureFolders() {
  const rootName = game.settings.get(MODULE_ID, "rootFolderName") || "Campaign Journal";
  const root = await findOrCreateFolder(rootName);
  return {
    quest: await findOrCreateFolder("Quests", root),
    lore: await findOrCreateFolder("Lore", root),
    history: await findOrCreateFolder("History", root)
  };
}

async function ensureDossierFolder() {
  const rootName = game.settings.get(MODULE_ID, "rootFolderName") || "Campaign Journal";
  const root = await findOrCreateFolder(rootName);
  return findOrCreateFolder("Private Dossiers", root);
}

function validateDossierPackage(payload) {
  const dossiers = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.dossiers)
      ? payload.dossiers
      : [payload];
  if (!dossiers.length) throw new Error("The dossier package is empty.");

  for (const [index, dossier] of dossiers.entries()) {
    if (!dossier || typeof dossier !== "object") throw new Error(`Dossier ${index + 1} must be an object.`);
    if (dossier.playerUuid !== undefined && typeof dossier.playerUuid !== "string") throw new Error(`playerUuid for dossier ${index + 1} must be a string.`);
    if (dossier.dossierId !== undefined && (typeof dossier.dossierId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(dossier.dossierId))) {
      throw new Error(`dossierId for dossier ${index + 1} must use lowercase letters, numbers, and hyphens.`);
    }
    if (!dossier.characterName) throw new Error(`Dossier ${index + 1} needs characterName.`);
    if (!dossier.backstory?.body) throw new Error(`Dossier for ${dossier.characterName} needs backstory.body.`);
    if (dossier.knowledge && !Array.isArray(dossier.knowledge)) throw new Error(`knowledge for ${dossier.characterName} must be an array.`);
    const knowledgeIds = new Set();
    for (const item of dossier.knowledge ?? []) {
      if (!item.id || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) throw new Error(`Knowledge entries for ${dossier.characterName} need lowercase IDs.`);
      if (knowledgeIds.has(item.id)) throw new Error(`Duplicate knowledge id "${item.id}" for ${dossier.characterName}.`);
      if (!item.title || !item.body) throw new Error(`Knowledge entry "${item.id}" needs title and body.`);
      knowledgeIds.add(item.id);
    }
  }
  return dossiers;
}

async function resolveDossierUser(reference) {
  const raw = reference.trim();
  const directUser = game.users.get(raw);
  if (directUser) return directUser;

  let document;
  try {
    document = await foundry.utils.fromUuid(raw);
  } catch (_exception) {
    document = null;
  }
  if (!document) throw new Error(`Could not resolve playerUuid "${raw}".`);
  if (document.documentName === "User") return document;
  if (document.documentName !== "Actor") throw new Error(`UUID "${raw}" must point to a User or Actor.`);

  const assignedUser = game.users.find((user) => (user.character?.id ?? user.character) === document.id);
  if (assignedUser) return assignedUser;
  const owningPlayer = game.users.find((user) => !user.isGM && document.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
  if (owningPlayer) return owningPlayer;
  throw new Error(`Actor "${document.name}" is not assigned to a player User.`);
}

function dossierIdentity(dossier, user = null) {
  const explicitId = String(dossier.dossierId ?? "").trim();
  if (explicitId) return `dossier:${explicitId}`;

  const reference = String(dossier.playerUuid ?? "").trim();
  if (/^Actor\./i.test(reference) || /\.Actor\./i.test(reference)) return `actor:${reference}`;

  const character = String(dossier.characterName ?? "character")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return user
    ? `user:${user.id}:character:${character || "unnamed"}`
    : `character:${character || "unnamed"}`;
}

function dossierPageContent(dossier, kind, knowledgeItem = null) {
  if (kind === "backstory") {
    return `<article class="lcj-dossier-page lcj-dossier-backstory">
      <span class="lcj-dossier-kicker">Private Character Chronicle</span>
      <h1>${escapeHtml(dossier.backstory.title ?? `${dossier.characterName}'s Backstory`)}</h1>
      ${dossier.backstory.summary ? `<p class="lcj-journal-summary"><em>${escapeHtml(dossier.backstory.summary)}</em></p>` : ""}
      ${dossier.backstory.body}
    </article>`;
  }
  if (kind === "knowledge-index") {
    const items = dossier.knowledge ?? [];
    return `<article class="lcj-dossier-page lcj-dossier-knowledge-index">
      <span class="lcj-dossier-kicker">Private Knowledge</span>
      <h1>What ${escapeHtml(dossier.characterName)} Knows</h1>
      ${items.length
        ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.summary ? ` — ${escapeHtml(item.summary)}` : ""}</li>`).join("")}</ul>`
        : "<p>No special knowledge has been recorded yet.</p>"}
    </article>`;
  }
  if (kind === "knowledge" && knowledgeItem) {
    const tags = knowledgeItem.tags?.length
      ? `<p class="lcj-journal-tags"><strong>Tags:</strong> ${knowledgeItem.tags.map(escapeHtml).join(", ")}</p>`
      : "";
    return `<article class="lcj-dossier-page lcj-dossier-knowledge">
      <span class="lcj-dossier-kicker">Known Only to You</span>
      <h1>${escapeHtml(knowledgeItem.title)}</h1>
      ${knowledgeItem.summary ? `<p class="lcj-journal-summary"><em>${escapeHtml(knowledgeItem.summary)}</em></p>` : ""}
      ${knowledgeItem.body}
      ${tags}
    </article>`;
  }
  return `<article class="lcj-dossier-page lcj-dossier-notes">
    <span class="lcj-dossier-kicker">Your Private Space</span>
    <h1>Personal Notes</h1>
    <p>This page belongs to ${escapeHtml(dossier.characterName)}. Use it for suspicions, plans, memories, and anything you want to keep with your story.</p>
  </article>`;
}

async function upsertDossierPage(entry, pageKey, name, content, { preserveExisting = false, sort = 0 } = {}) {
  const page = entry.pages.find((candidate) => flag(candidate, "dossierPageKey") === pageKey);
  if (page && preserveExisting) return page;
  if (page) {
    await page.update({
      name,
      sort,
      "text.content": content,
      "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    });
    return page;
  }
  const [created] = await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name,
    type: "text",
    sort,
    text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 },
    flags: { [MODULE_ID]: { privateDossier: true, dossierPageKey: pageKey } }
  }]);
  return created;
}

async function importPrivateDossiers(payload) {
  if (!game.user.isGM) throw new Error("Only a GM can import private dossiers.");
  const dossiers = validateDossierPackage(payload);
  const folder = await ensureDossierFolder();
  const results = [];

  for (const dossier of dossiers) {
    const playerReference = String(dossier.playerUuid ?? "").trim();
    const user = playerReference ? await resolveDossierUser(playerReference) : null;
    const dossierKey = dossierIdentity(dossier, user);
    let entry = game.journal.find((candidate) =>
      flag(candidate, "privateDossier")
      && flag(candidate, "dossierKey") === dossierKey
    );
    if (!entry) {
      const normalizedCharacterName = String(dossier.characterName).trim().toLocaleLowerCase();
      entry = game.journal.find((candidate) =>
        flag(candidate, "privateDossier")
        && !flag(candidate, "dossierKey")
        && (!user || flag(candidate, "dossierUserId") === user.id)
        && String(flag(candidate, "dossierCharacterName") ?? "").trim().toLocaleLowerCase() === normalizedCharacterName
      );
    }
    const ownership = entry
      ? foundry.utils.deepClone(entry.ownership ?? {})
      : { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if (user) ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const dossierFlags = {
      privateDossier: true,
      dossierKey,
      dossierCharacterName: dossier.characterName,
      dossierRevision: String(dossier.revision ?? 1),
      dossierHash: hashSource(dossier)
    };
    if (user) {
      dossierFlags.dossierUserId = user.id;
      dossierFlags.dossierUserUuid = user.uuid;
    }

    if (!entry) {
      entry = await JournalEntry.create({
        name: dossier.title ?? `${dossier.characterName} — Private Journal`,
        folder: folder.id,
        ownership,
        flags: { [MODULE_ID]: dossierFlags }
      });
    } else {
      const allFlags = foundry.utils.deepClone(entry.flags ?? {});
      allFlags[MODULE_ID] = { ...(allFlags[MODULE_ID] ?? {}), ...dossierFlags };
      await entry.update({
        name: dossier.title ?? `${dossier.characterName} — Private Journal`,
        folder: folder.id,
        ownership,
        flags: allFlags
      });
    }

    await upsertDossierPage(entry, "backstory", "01 — Backstory", dossierPageContent(dossier, "backstory"), { sort: 100000 });
    await upsertDossierPage(entry, "knowledge-index", "02 — What I Know", dossierPageContent(dossier, "knowledge-index"), { sort: 200000 });
    let sort = 300000;
    for (const item of dossier.knowledge ?? []) {
      await upsertDossierPage(entry, `knowledge:${item.id}`, `Known — ${item.title}`, dossierPageContent(dossier, "knowledge", item), { sort });
      sort += 100000;
    }
    await upsertDossierPage(entry, "personal-notes", "Personal Notes", dossierPageContent(dossier, "notes"), { preserveExisting: true, sort: 900000 });
    results.push({ entry, user, characterName: dossier.characterName });
  }

  info(`Imported ${results.length} private player dossier${results.length === 1 ? "" : "s"}.`);
  journalApp?.render();
  return results;
}

function isJsonDossierFile(file) {
  return Boolean(file?.name?.toLowerCase().endsWith(".json"));
}

async function readDossierFile(file) {
  if (!file) throw new Error("Choose a dossier .json file before importing.");
  if (!isJsonDossierFile(file)) throw new Error("Private dossiers must be imported from a .json file.");
  const raw = (await file.text()).replace(/^\uFEFF/, "").trim();
  if (!raw) throw new Error(`${file.name} is empty.`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${file.name} is not a valid dossier JSON file.`);
  }
}

async function openDossierImporter() {
  const { DialogV2 } = foundry.applications.api;
  let selectedFile = null;
  const content = document.createElement("div");
  content.innerHTML = `<div class="lcj-dossier-import">
    <label class="lcj-dossier-drop" data-lcj-dossier-drop tabindex="0">
      <input type="file" name="dossierFile" accept=".json,application/json" data-lcj-dossier-file>
      <span class="lcj-dossier-drop-icon"><i class="fa-solid fa-file-arrow-up"></i></span>
      <strong>Drop a dossier .json file here</strong>
      <span>or click to choose a file</span>
      <small data-lcj-dossier-filename aria-live="polite">No file selected</small>
    </label>
  </div>`;
  const dossierFile = await DialogV2.input({
    window: { title: "Import Private Dossier" },
    content,
    ok: {
      label: "Import JSON",
      icon: "fa-solid fa-user-shield",
      callback: (_event, button) => selectedFile ?? button.form.elements.dossierFile.files?.[0] ?? null
    },
    render: (_event, dialog) => {
      const root = dialog.element;
      const dropZone = root.querySelector("[data-lcj-dossier-drop]");
      const fileInput = root.querySelector("[data-lcj-dossier-file]");
      const fileName = root.querySelector("[data-lcj-dossier-filename]");
      const importButton = dialog.form?.querySelector('button[data-action="ok"]') ?? root.querySelector('button[data-action="ok"]');

      const showFile = (file) => {
        selectedFile = file ?? null;
        const valid = isJsonDossierFile(selectedFile);
        dropZone.classList.toggle("has-file", valid);
        dropZone.classList.toggle("has-error", Boolean(selectedFile) && !valid);
        fileName.textContent = selectedFile
          ? valid ? selectedFile.name : "Choose a .json file"
          : "No file selected";
        if (importButton) importButton.disabled = !valid;
      };

      fileInput.addEventListener("change", () => showFile(fileInput.files?.[0]));
      dropZone.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        fileInput.click();
      });
      for (const eventName of ["dragenter", "dragover"]) {
        dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropZone.classList.add("is-dragging");
        });
      }
      dropZone.addEventListener("dragleave", (event) => {
        if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("is-dragging");
      });
      dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
        showFile(event.dataTransfer?.files?.[0]);
      });
      showFile(selectedFile);
    },
    modal: true,
    rejectClose: false
  });
  if (!dossierFile) return [];
  return importPrivateDossiers(await readDossierFile(dossierFile));
}

function detailRows(source) {
  const rows = [];
  if (source.quest?.giver) rows.push(["Quest giver", source.quest.giver]);
  if (source.quest?.location) rows.push(["Location", source.quest.location]);
  if (source.quest?.rewards) rows.push(["Rewards", source.quest.rewards]);
  if (source.quest?.rank) rows.push(["Standing", source.quest.rank]);
  if (source.quest?.scope === "personal" && source.quest?.owner) rows.push(["Personal quest for", source.quest.owner]);
  if (source.history?.date) rows.push(["Date", source.history.date]);
  if (source.lore?.category) rows.push(["Category", source.lore.category]);
  if (!rows.length) return "";
  return `<dl class="lcj-journal-details">${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

function renderJournalPage(source, progress) {
  const objectives = source.quest?.objectives ?? [];
  const objectiveHtml = objectives.length
    ? `<section><h2>Objectives</h2><ul class="lcj-journal-objectives">${objectives.map((objective) => {
      const complete = Boolean(progress.objectives?.[objective.id]);
      return `<li>${complete ? "☑" : "☐"} ${escapeHtml(objective.text)}</li>`;
    }).join("")}</ul></section>`
    : "";
  const tags = source.tags?.length
    ? `<p class="lcj-journal-tags"><strong>Tags:</strong> ${source.tags.map(escapeHtml).join(", ")}</p>`
    : "";
  const status = source.type === "quest"
    ? `<p><strong>Status:</strong> ${escapeHtml(progress.status)}</p>`
    : "";
  const selectedNames = (progress.selectedBy ?? []).map((userId) => game.users.get(userId)?.name).filter(Boolean);
  const participantNames = (progress.participants ?? []).map((userId) => game.users.get(userId)?.name).filter(Boolean);
  const partyActivity = source.type === "quest"
    ? `<section class="lcj-journal-party">
      ${selectedNames.length ? `<p><strong>Party votes:</strong> ${selectedNames.map(escapeHtml).join(", ")}</p>` : ""}
      ${participantNames.length ? `<p><strong>Joined adventurers:</strong> ${participantNames.map(escapeHtml).join(", ")}</p>` : ""}
    </section>`
    : "";

  return `<article class="lcj-journal-page" data-lcj-source-id="${escapeHtml(source.id)}">
    ${source.summary ? `<p class="lcj-journal-summary"><em>${escapeHtml(source.summary)}</em></p>` : ""}
    ${status}
    ${detailRows(source)}
    ${partyActivity}
    ${source.body ?? ""}
    ${objectiveHtml}
    ${tags}
  </article>`;
}

async function upsertPage(entry, source, progress) {
  const content = renderJournalPage(source, progress);
  const page = entry.pages.find((candidate) => flag(candidate, "managed")) ?? entry.pages.contents[0];
  if (page) {
    await page.update({
      name: source.title,
      "text.content": content,
      "text.format": CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1,
      [`flags.${MODULE_ID}.managed`]: true
    });
    return;
  }
  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name: source.title,
    type: "text",
    text: {
      content,
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1
    },
    flags: { [MODULE_ID]: { managed: true } }
  }]);
}

function managedEntries() {
  return game.journal.filter((entry) => flag(entry, "managed") === true);
}

async function syncLibrary({ force = false, quiet = false } = {}) {
  if (!game.user?.isGM) {
    warn("Only a GM can synchronize campaign content.");
    return { created: 0, updated: 0, skipped: 0, deleted: 0 };
  }

  try {
    const library = await loadLibrary();
    const folders = await ensureFolders();
    const existingById = new Map(managedEntries().map((entry) => [flag(entry, "sourceId"), entry]));
    const results = { created: 0, updated: 0, skipped: 0, deleted: 0 };

    for (const sourceId of library.retiredEntries ?? []) {
      const retiredEntry = existingById.get(sourceId);
      if (!retiredEntry || flag(retiredEntry, "managed") !== true) continue;
      await retiredEntry.delete();
      existingById.delete(sourceId);
      results.deleted += 1;
    }

    for (const source of library.entries) {
      const existing = existingById.get(source.id);
      const sourceHash = hashSource(source);
      if (existing && !force && flag(existing, "sourceHash") === sourceHash) {
        results.skipped += 1;
        continue;
      }

      const progress = mergedProgress(source, existing ? flag(existing, "progress") : null);
      const moduleFlags = {
        managed: true,
        sourceId: source.id,
        sourceHash,
        sourceRevision: String(source.revision ?? 1),
        category: source.type,
        source,
        progress
      };

      if (!existing) {
        const created = await JournalEntry.create({
          name: source.title,
          folder: folders[source.type].id,
          ownership: desiredOwnership(source),
          flags: { [MODULE_ID]: moduleFlags }
        });
        await upsertPage(created, source, progress);
        results.created += 1;
        continue;
      }

      const allFlags = foundry.utils.deepClone(existing.flags ?? {});
      allFlags[MODULE_ID] = moduleFlags;
      await existing.update({
        name: source.title,
        folder: folders[source.type].id,
        ownership: desiredOwnership(source, existing),
        flags: allFlags
      });
      await upsertPage(existing, source, progress);
      results.updated += 1;
    }

    const campaignMeta = {
      title: library.campaign.title,
      subtitle: library.campaign.subtitle ?? "",
      questStatuses: library.questStatuses ?? [
        { id: "available", label: "Available" },
        { id: "active", label: "Active" },
        { id: "completed", label: "Completed" },
        { id: "failed", label: "Failed" }
      ]
    };
    await game.settings.set(MODULE_ID, "campaignMeta", campaignMeta);
    await game.settings.set(MODULE_ID, "lastSync", new Date().toISOString());

    if (!quiet) info(`Sync complete — ${results.created} created, ${results.updated} updated, ${results.skipped} unchanged, ${results.deleted} retired.`);
    journalApp?.render();
    return results;
  } catch (exception) {
    error(exception.message);
    throw exception;
  }
}

async function saveProgress(entry, _source, progress) {
  await entry.update({ [`flags.${MODULE_ID}.progress`]: progress });
}

async function handleQuestAction({ action, entryId, userId }) {
  if (!isPrimaryGm()) return;
  const requester = game.users.get(userId);
  const entry = game.journal.get(entryId);
  if (!requester || !entry || flag(entry, "managed") !== true) return;
  if (!requester.isGM && !entry.testUserPermission(requester, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return;

  const source = flag(entry, "source");
  if (source?.type !== "quest") return;
  const progress = foundry.utils.deepClone(flag(entry, "progress") ?? defaultProgress(source));
  progress.selectedBy ??= [];
  progress.participants ??= [];

  if (action === "selectQuest") {
    if ((source.quest?.scope ?? "party") === "personal" || progress.status !== "available") return;
    const wasSelected = progress.selectedBy.includes(userId);

    for (const candidate of managedEntries()) {
      if (candidate.id === entry.id) continue;
      const candidateSource = flag(candidate, "source");
      if (candidateSource?.type !== "quest") continue;
      const candidateProgress = foundry.utils.deepClone(flag(candidate, "progress") ?? defaultProgress(candidateSource));
      if (!candidateProgress.selectedBy?.includes(userId)) continue;
      candidateProgress.selectedBy = candidateProgress.selectedBy.filter((candidateId) => candidateId !== userId);
      await saveProgress(candidate, candidateSource, candidateProgress);
    }

    progress.selectedBy = wasSelected
      ? progress.selectedBy.filter((candidateId) => candidateId !== userId)
      : [...new Set([...progress.selectedBy, userId])];
    await saveProgress(entry, source, progress);
    return;
  }

  if (action === "joinPersonalQuest") {
    if (source.quest?.scope !== "personal" || ["completed", "failed"].includes(progress.status)) return;
    progress.participants = progress.participants.includes(userId)
      ? progress.participants.filter((candidateId) => candidateId !== userId)
      : [...new Set([...progress.participants, userId])];
    await saveProgress(entry, source, progress);
  }
}

async function requestQuestAction(action, entryId) {
  if (!activeGmId()) {
    warn("An active GM is needed to record quest-board choices.");
    return;
  }
  const request = { action, entryId, userId: game.user.id };
  if (isPrimaryGm()) await handleQuestAction(request);
  else {
    game.socket.emit(SOCKET_CHANNEL, request);
    info("Your quest-board choice was sent to the GM.");
  }
}

function statusDefinitions() {
  const meta = game.settings.get(MODULE_ID, "campaignMeta") ?? {};
  return meta.questStatuses?.length ? meta.questStatuses : [
    { id: "available", label: "Available" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" }
  ];
}

function userChips(userIds = []) {
  return [...new Set(userIds)].map((userId) => {
    const user = game.users.get(userId);
    if (!user) return null;
    const displayName = user.character?.name ?? user.name;
    return {
      id: user.id,
      name: displayName,
      initial: displayName.trim().slice(0, 1).toLocaleUpperCase()
    };
  }).filter(Boolean);
}

function privateDossierView(entry) {
  const flaggedUserId = flag(entry, "dossierUserId");
  const ownershipLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const user = game.users.get(flaggedUserId) ?? game.users.find((candidate) =>
    !candidate.isGM && Number(entry.ownership?.[candidate.id] ?? 0) >= ownershipLevel
  );
  const userId = user?.id ?? null;
  const pages = entry.pages.contents;
  const backstory = pages.find((page) => flag(page, "dossierPageKey") === "backstory");
  const knowledgePages = pages.filter((page) => flag(page, "dossierPageKey")?.startsWith("knowledge:"));
  return {
    entryId: entry.id,
    title: entry.name,
    characterName: flag(entry, "dossierCharacterName") ?? user?.character?.name ?? user?.name ?? "Unknown Character",
    playerName: user?.name ?? "Unknown Player",
    isMine: userId === game.user.id,
    knowledgeCount: knowledgePages.length,
    pageCount: pages.length,
    backstoryPreview: backstory ? plainText(backstory.text.content).slice(0, 240) : "No backstory has been imported yet."
  };
}

function entryView(entry) {
  const source = flag(entry, "source");
  const progress = flag(entry, "progress") ?? defaultProgress(source);
  const statuses = statusDefinitions();
  const status = statuses.find((candidate) => candidate.id === progress.status) ?? { id: progress.status, label: progress.status };
  const objectives = (source.quest?.objectives ?? []).map((objective) => ({
    ...objective,
    complete: Boolean(progress.objectives?.[objective.id])
  }));
  const completedObjectives = objectives.filter((objective) => objective.complete).length;
  const personal = source.quest?.scope === "personal";
  const isNew = source.quest?.new === true && progress.status === "available";
  const selectedUsers = userChips(progress.selectedBy);
  const participants = userChips(progress.participants);
  const hasSelected = progress.selectedBy?.includes(game.user.id) ?? false;
  const hasJoined = progress.participants?.includes(game.user.id) ?? false;
  return {
    entryId: entry.id,
    id: source.id,
    title: source.title,
    type: source.type,
    summary: plainText(source.summary ?? source.body ?? "").slice(0, 280),
    tags: source.tags ?? [],
    statusId: status.id,
    statusLabel: status.label,
    giver: source.quest?.giver ?? "",
    location: source.quest?.location ?? "",
    rewards: source.quest?.rewards ?? "",
    rank: source.quest?.rank ?? "",
    postedAt: source.quest?.postedAt ?? "",
    owner: source.quest?.owner ?? "",
    personal,
    isNew,
    canVote: source.type === "quest" && !personal && progress.status === "available",
    canJoin: source.type === "quest" && personal && !["completed", "failed"].includes(progress.status),
    hasSelected,
    hasJoined,
    voteLabel: hasSelected ? "Withdraw vote" : "Choose this quest",
    joinLabel: hasJoined ? "Leave quest" : "Join this quest",
    selectedUsers,
    participants,
    choiceCount: selectedUsers.length,
    objectives,
    objectiveProgress: objectives.length ? `${completedObjectives}/${objectives.length}` : "",
    date: source.history?.date ?? "",
    dateSort: source.history?.sort ?? source.history?.date ?? source.title,
    loreCategory: source.lore?.category ?? "",
    gmOnly: source.visibility === "gm"
  };
}

function openJournalEntry(entry) {
  const sheet = entry.sheet;
  const ApplicationV2 = foundry.applications?.api?.ApplicationV2;
  if (ApplicationV2 && sheet instanceof ApplicationV2) sheet.render({ force: true });
  else sheet.render(true);
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LivingCampaignJournalApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "living-campaign-journal-app",
    classes: ["living-campaign-journal"],
    position: { width: 960, height: 720 },
    window: { title: MODULE_TITLE, resizable: true },
    actions: {
      sync: this._onSync,
      refresh: this._onRefresh,
      openJournal: this._onOpenJournal,
      cycleStatus: this._onCycleStatus,
      toggleObjective: this._onToggleObjective,
      selectQuest: this._onSelectQuest,
      joinPersonalQuest: this._onJoinPersonalQuest,
      importDossiers: this._onImportDossiers,
      addMapPin: this._onAddMapPin,
      openMapPin: this._onOpenMapPin,
      editMapPin: this._onEditMapPin,
      moveMapPin: this._onMoveMapPin,
      deleteMapPin: this._onDeleteMapPin,
      openMapJournal: this._onOpenMapJournal,
      mapZoomIn: this._onMapZoomIn,
      mapZoomOut: this._onMapZoomOut,
      mapReset: this._onMapReset,
      changeTab: this._onChangeTab
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dashboard.hbs` }
  };

  activeTab = "quests";
  mapView = { scale: 1, x: 0, y: 0 };
  mapPlacement = null;
  selectedMapPinId = null;
  mapPinsById = new Map();

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entries = managedEntries()
      .filter((entry) => entry.visible)
      .map(entryView);
    const quests = entries
      .filter((entry) => entry.type === "quest")
      .sort((left, right) => left.statusLabel.localeCompare(right.statusLabel) || left.title.localeCompare(right.title));
    const byInterestThenTitle = (left, right) => right.choiceCount - left.choiceCount || left.title.localeCompare(right.title);
    const newQuests = quests.filter((entry) => !entry.personal && entry.statusId === "available" && entry.isNew).sort(byInterestThenTitle);
    const availableQuests = quests.filter((entry) => !entry.personal && entry.statusId === "available" && !entry.isNew).sort(byInterestThenTitle);
    const personalQuests = quests.filter((entry) => entry.personal && !["completed", "failed"].includes(entry.statusId)).sort((left, right) => left.title.localeCompare(right.title));
    const activeQuests = quests.filter((entry) => !entry.personal && entry.statusId === "active").sort((left, right) => left.title.localeCompare(right.title));
    const resolvedQuests = quests.filter((entry) => ["completed", "failed"].includes(entry.statusId)).sort((left, right) => left.title.localeCompare(right.title));
    const questSections = [
      { id: "new", label: "New Invitations", subtitle: "Fresh engagements and calls for aid", icon: "fa-solid fa-sparkles", quests: newQuests },
      { id: "choices", label: "Open Engagements", subtitle: "Choose where the party should go next", icon: "fa-solid fa-map-location-dot", quests: availableQuests },
      { id: "personal", label: "Personal Promises", subtitle: "One hero's promise, open to every companion", icon: "fa-solid fa-star", quests: personalQuests },
      { id: "active", label: "In Progress", subtitle: "Journeys already underway", icon: "fa-solid fa-compass", quests: activeQuests },
      { id: "resolved", label: "Closed Chapters", subtitle: "Every promise leaves a record", icon: "fa-solid fa-bookmark", quests: resolvedQuests }
    ].map((section) => ({ ...section, hasQuests: section.quests.length > 0 }));
    const playerChoice = quests.find((entry) => entry.hasSelected && entry.statusId === "available");
    const joinedPersonal = personalQuests.filter((entry) => entry.hasJoined);
    const lore = entries
      .filter((entry) => entry.type === "lore")
      .sort((left, right) => left.loreCategory.localeCompare(right.loreCategory) || left.title.localeCompare(right.title));
    const history = entries
      .filter((entry) => entry.type === "history")
      .sort((left, right) => String(left.dateSort).localeCompare(String(right.dateSort)));
    const privateDossiers = game.journal
      .filter((entry) => flag(entry, "privateDossier") === true && entry.visible)
      .map(privateDossierView)
      .sort((left, right) => left.characterName.localeCompare(right.characterName));
    const mapPins = currentMapPins().map(mapPinView);
    this.mapPinsById = new Map(mapPins.map((pin) => [pin.id, pin]));
    const tabs = [
      { id: "quests", label: "Quest Ledger", icon: "fa-solid fa-scroll", count: quests.length },
      { id: "map", label: "World Map", icon: "fa-solid fa-map-location-dot", count: mapPins.length },
      { id: "lore", label: "Lore", icon: "fa-solid fa-book-open", count: lore.length },
      { id: "history", label: "History", icon: "fa-solid fa-timeline", count: history.length }
    ];
    if (privateDossiers.length) {
      tabs.push({
        id: "story",
        label: game.user.isGM ? "Dossiers" : "My Story",
        icon: "fa-solid fa-feather-pointed",
        count: privateDossiers.length
      });
    }
    const preparedTabs = tabs.map((tab) => ({ ...tab, active: tab.id === this.activeTab }));
    const meta = game.settings.get(MODULE_ID, "campaignMeta") ?? {};
    const lastSync = game.settings.get(MODULE_ID, "lastSync");
    return foundry.utils.mergeObject(context, {
      campaignTitle: meta.title ?? "Campaign Journal",
      campaignSubtitle: meta.subtitle ?? "Quests, lore, and history",
      tabs: preparedTabs,
      quests,
      questSections,
      playerChoice,
      hasPlayerChoice: Boolean(playerChoice),
      joinedPersonal,
      hasJoinedPersonal: joinedPersonal.length > 0,
      mapImagePath: WORLD_MAP_PATH,
      mapPins,
      hasMapPins: mapPins.length > 0,
      lore,
      history,
      privateDossiers,
      hasPrivateDossiers: privateDossiers.length > 0,
      questsActive: this.activeTab === "quests",
      mapActive: this.activeTab === "map",
      loreActive: this.activeTab === "lore",
      historyActive: this.activeTab === "history",
      storyActive: this.activeTab === "story",
      canManage: game.user.isGM,
      lastSyncLabel: lastSync ? new Date(lastSync).toLocaleString() : "Never"
    }, { inplace: false });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const search = this.element.querySelector("[data-lcj-search]");
    search?.addEventListener("input", () => this._filterCards(search.value));
    this._bindMapInteractions();
    this._applyMapTransform();
    if (this.selectedMapPinId && this.mapPinsById.has(this.selectedMapPinId)) {
      this._showMapPin(this.selectedMapPinId);
    }
  }

  _filterCards(query) {
    const needle = query.trim().toLocaleLowerCase();
    for (const card of this.element.querySelectorAll("[data-lcj-card]")) {
      card.hidden = Boolean(needle) && !card.textContent.toLocaleLowerCase().includes(needle);
    }
  }

  _applyMapTransform() {
    const canvas = this.element?.querySelector("[data-lcj-map-canvas]");
    if (!canvas) return;
    const { scale, x, y } = this.mapView;
    canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    const label = this.element.querySelector("[data-lcj-map-zoom-label]");
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
  }

  _setMapScale(nextScale) {
    this.mapView.scale = clamp(nextScale, 1, 3.5);
    if (this.mapView.scale === 1) {
      this.mapView.x = 0;
      this.mapView.y = 0;
    }
    this._applyMapTransform();
  }

  _setMapPlacementStatus(message = "") {
    const stage = this.element?.querySelector("[data-lcj-map-viewport]");
    const status = this.element?.querySelector("[data-lcj-map-status]");
    stage?.classList.toggle("is-placing", Boolean(message));
    if (status) {
      status.hidden = !message;
      status.textContent = message;
    }
  }

  _armMapPlacement(mode, pinId = null) {
    this.mapPlacement = { mode, pinId };
    this._setMapPlacementStatus(mode === "move" ? "Click the map to move this pin." : "Click the map where the new pin belongs.");
  }

  _bindMapInteractions() {
    const viewport = this.element?.querySelector("[data-lcj-map-viewport]");
    const canvas = this.element?.querySelector("[data-lcj-map-canvas]");
    if (!viewport || !canvas) return;

    let drag = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.mapPlacement || event.target.closest("[data-lcj-map-pin]")) return;
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mapX: this.mapView.x, mapY: this.mapView.y };
      viewport.setPointerCapture?.(event.pointerId);
      viewport.classList.add("is-panning");
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.mapView.x = drag.mapX + event.clientX - drag.startX;
      this.mapView.y = drag.mapY + event.clientY - drag.startY;
      this._applyMapTransform();
    });
    const finishDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove("is-panning");
      drag = null;
    };
    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      this._setMapScale(this.mapView.scale + (event.deltaY < 0 ? 0.2 : -0.2));
    }, { passive: false });
    viewport.addEventListener("click", async (event) => {
      if (!this.mapPlacement || event.target.closest("[data-lcj-map-pin]")) return;
      const rectangle = canvas.getBoundingClientRect();
      const coordinates = {
        x: clamp(((event.clientX - rectangle.left) / rectangle.width) * 100, 0, 100),
        y: clamp(((event.clientY - rectangle.top) / rectangle.height) * 100, 0, 100)
      };
      const placement = this.mapPlacement;
      this.mapPlacement = null;
      this._setMapPlacementStatus();
      try {
        if (placement.mode === "move") {
          const pin = this.mapPinsById.get(placement.pinId);
          if (!pin) return;
          const pins = currentMapPins().map((candidate) => candidate.id === pin.id ? { ...candidate, ...coordinates } : candidate);
          await saveMapPins(pins);
          this.selectedMapPinId = pin.id;
          info(`Moved map pin “${pin.title}”.`);
        } else {
          const pin = await openMapPinEditor(null, coordinates);
          if (!pin) return;
          await saveMapPins([...currentMapPins(), pin]);
          this.selectedMapPinId = pin.id;
          info(`Added map pin “${pin.title}”.`);
        }
        await this.render();
      } catch (exception) {
        error(exception.message);
      }
    });
  }

  _showMapPin(pinId) {
    const pin = this.mapPinsById.get(pinId);
    const panel = this.element?.querySelector("[data-lcj-map-detail]");
    if (!pin || !panel) return;
    this.selectedMapPinId = pinId;
    panel.hidden = false;
    panel.querySelector("[data-lcj-map-detail-icon]").className = pin.iconClass;
    panel.querySelector("[data-lcj-map-detail-icon]").style.color = pin.color;
    panel.querySelector("[data-lcj-map-detail-type]").textContent = pin.typeLabel;
    panel.querySelector("[data-lcj-map-detail-title]").textContent = pin.title;
    panel.querySelector("[data-lcj-map-detail-description]").textContent = pin.description || "No additional information has been recorded yet.";
    for (const button of panel.querySelectorAll("[data-pin-id]")) button.dataset.pinId = pin.id;
    const linkedButton = panel.querySelector("[data-lcj-map-linked]");
    if (linkedButton) linkedButton.hidden = !pin.hasJournalLink;
    for (const marker of this.element.querySelectorAll("[data-lcj-map-pin]")) {
      marker.classList.toggle("is-selected", marker.dataset.pinId === pin.id);
    }
  }

  static async _onSync(event) {
    await syncLibrary({ force: event.shiftKey });
    await this.render();
  }

  static async _onRefresh() {
    await this.render();
  }

  static _onOpenJournal(_event, target) {
    const entry = game.journal.get(target.dataset.entryId);
    if (entry) openJournalEntry(entry);
  }

  static async _onCycleStatus(_event, target) {
    if (!game.user.isGM) return;
    const entry = game.journal.get(target.dataset.entryId);
    if (!entry) return;
    const source = flag(entry, "source");
    const progress = foundry.utils.deepClone(flag(entry, "progress") ?? defaultProgress(source));
    const statuses = statusDefinitions();
    const currentIndex = Math.max(0, statuses.findIndex((status) => status.id === progress.status));
    progress.status = statuses[(currentIndex + 1) % statuses.length].id;
    if (progress.status !== "available") progress.selectedBy = [];
    await saveProgress(entry, source, progress);
    await this.render();
  }

  static async _onToggleObjective(_event, target) {
    if (!game.user.isGM) return;
    const entry = game.journal.get(target.dataset.entryId);
    if (!entry) return;
    const source = flag(entry, "source");
    const progress = foundry.utils.deepClone(flag(entry, "progress") ?? defaultProgress(source));
    progress.objectives ??= {};
    progress.objectives[target.dataset.objectiveId] = !progress.objectives[target.dataset.objectiveId];
    await saveProgress(entry, source, progress);
    await this.render();
  }

  static async _onSelectQuest(_event, target) {
    await requestQuestAction("selectQuest", target.dataset.entryId);
    if (isPrimaryGm()) await this.render();
  }

  static async _onJoinPersonalQuest(_event, target) {
    await requestQuestAction("joinPersonalQuest", target.dataset.entryId);
    if (isPrimaryGm()) await this.render();
  }

  static async _onImportDossiers() {
    if (!game.user.isGM) return;
    try {
      await openDossierImporter();
      await this.render();
    } catch (exception) {
      error(exception.message);
    }
  }

  static _onAddMapPin() {
    if (!game.user.isGM) return;
    this._armMapPlacement("add");
  }

  static _onOpenMapPin(_event, target) {
    this._showMapPin(target.dataset.pinId);
  }

  static async _onEditMapPin(_event, target) {
    if (!game.user.isGM) return;
    const pin = this.mapPinsById.get(target.dataset.pinId);
    if (!pin) return;
    try {
      const updated = await openMapPinEditor(pin);
      if (!updated) return;
      const pins = currentMapPins().map((candidate) => candidate.id === pin.id ? updated : candidate);
      await saveMapPins(pins);
      this.selectedMapPinId = pin.id;
      await this.render();
      info(`Updated map pin “${updated.title}”.`);
    } catch (exception) {
      error(exception.message);
    }
  }

  static _onMoveMapPin(_event, target) {
    if (!game.user.isGM || !this.mapPinsById.has(target.dataset.pinId)) return;
    this._armMapPlacement("move", target.dataset.pinId);
  }

  static async _onDeleteMapPin(_event, target) {
    if (!game.user.isGM) return;
    const pin = this.mapPinsById.get(target.dataset.pinId);
    if (!pin) return;
    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: `Delete map pin: ${pin.title}` },
      content: `<p>Remove <strong>${escapeHtml(pin.title)}</strong> from the world map?</p>`,
      yes: { label: "Delete pin", icon: "fa-solid fa-trash" },
      no: { label: "Keep pin" },
      modal: true
    });
    if (!confirmed) return;
    try {
      await saveMapPins(currentMapPins().filter((candidate) => candidate.id !== pin.id));
      this.selectedMapPinId = null;
      await this.render();
      info(`Removed map pin “${pin.title}”.`);
    } catch (exception) {
      error(exception.message);
    }
  }

  static async _onOpenMapJournal(_event, target) {
    const pin = this.mapPinsById.get(target.dataset.pinId);
    if (!pin?.journalUuid) return;
    const document = await fromUuid(pin.journalUuid);
    const entry = document?.documentName === "JournalEntryPage" ? document.parent : document;
    if (!entry?.sheet) {
      warn(`The journal linked to “${pin.title}” is no longer available.`);
      return;
    }
    openJournalEntry(entry);
  }

  static _onMapZoomIn() {
    this._setMapScale(this.mapView.scale + 0.25);
  }

  static _onMapZoomOut() {
    this._setMapScale(this.mapView.scale - 0.25);
  }

  static _onMapReset() {
    this.mapView = { scale: 1, x: 0, y: 0 };
    this.mapPlacement = null;
    this._setMapPlacementStatus();
    this._applyMapTransform();
  }

  static _onChangeTab(_event, target) {
    this.activeTab = target.dataset.tab;
    for (const tab of this.element.querySelectorAll("[data-lcj-tab]")) {
      tab.classList.toggle("active", tab.dataset.tab === this.activeTab);
      tab.setAttribute("aria-selected", String(tab.dataset.tab === this.activeTab));
    }
    for (const panel of this.element.querySelectorAll("[data-lcj-panel]")) {
      panel.hidden = panel.dataset.lcjPanel !== this.activeTab;
    }
    if (this.activeTab === "map") requestAnimationFrame(() => this._applyMapTransform());
  }
}

function openCampaignJournal() {
  journalApp ??= new LivingCampaignJournalApp();
  journalApp.render({ force: true });
  return journalApp;
}

function addDirectoryButton(_application, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector("[data-lcj-directory-button]")) return;
  const header = root.querySelector(".directory-header .header-actions, .directory-header");
  if (!header) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.lcjDirectoryButton = "true";
  button.innerHTML = '<i class="fa-solid fa-compass"></i> Campaign Journal';
  button.addEventListener("click", openCampaignJournal);
  header.append(button);
}

Hooks.once("init", () => {
  game.keybindings.register(MODULE_ID, "openCampaignJournal", {
    name: `${MODULE_TITLE}: Open journal`,
    hint: "Open the campaign quest board, lore archive, and journal.",
    editable: [{ key: "KeyJ" }],
    onDown: () => {
      openCampaignJournal();
      return true;
    }
  });

  game.settings.register(MODULE_ID, "sourcePath", {
    name: "Campaign JSON path",
    hint: "A Foundry-relative path or CORS-enabled URL containing the campaign library.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: DEFAULT_SOURCE_PATH
  });
  game.settings.register(MODULE_ID, "rootFolderName", {
    name: "Journal folder name",
    hint: "The root Journal folder used for synchronized entries.",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "Campaign Journal"
  });
  game.settings.register(MODULE_ID, "pollMinutes", {
    name: "Legacy automatic synchronization interval",
    hint: "Automatic synchronization is disabled. Use Sync now when you want Foundry to apply campaign source changes.",
    scope: "world",
    config: false,
    restricted: true,
    type: Number,
    range: { min: 0, max: 1440, step: 1 },
    default: 0
  });
  game.settings.register(MODULE_ID, "campaignMeta", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, "lastSync", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "mapPins", {
    scope: "world",
    config: false,
    restricted: true,
    type: Object,
    default: { schemaVersion: 1, pins: [] }
  });
});

Hooks.once("ready", async () => {
  const api = {
    open: openCampaignJournal,
    sync: syncLibrary,
    importDossiers: importPrivateDossiers,
    getMapPins: () => foundry.utils.deepClone(currentMapPins()),
    setMapPins: saveMapPins
  };
  game.modules.get(MODULE_ID).api = api;
  game.socket.on(SOCKET_CHANNEL, handleQuestAction);

  if (!isPrimaryGm()) return;
  const configuredSourcePath = game.settings.get(MODULE_ID, "sourcePath");
  if (!configuredSourcePath || configuredSourcePath === BUNDLED_SOURCE_PATH) {
    await game.settings.set(MODULE_ID, "sourcePath", DEFAULT_SOURCE_PATH);
  }
});

Hooks.on("renderJournalDirectory", addDirectoryButton);
Hooks.on("updateJournalEntry", (entry) => {
  if (flag(entry, "managed") && journalApp?.rendered) journalApp.render();
});
Hooks.on("deleteJournalEntry", (entry) => {
  if (flag(entry, "managed") && journalApp?.rendered) journalApp.render();
});
Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.mapPins` && journalApp?.rendered) journalApp.render();
});
