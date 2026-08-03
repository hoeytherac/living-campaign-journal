const MODULE_ID = "living-campaign-journal";
const MODULE_TITLE = "Living Campaign Journal";
const DEFAULT_SOURCE_PATH = `modules/${MODULE_ID}/content/campaign.json`;
const SOCKET_CHANNEL = `module.${MODULE_ID}`;

let journalApp;
let syncTimer;

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
    if (!dossier.playerUuid || typeof dossier.playerUuid !== "string") throw new Error(`Dossier ${index + 1} needs playerUuid.`);
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
    const user = await resolveDossierUser(dossier.playerUuid);
    const ownership = {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
      [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    };
    let entry = game.journal.find((candidate) => flag(candidate, "privateDossier") && flag(candidate, "dossierUserId") === user.id);
    const dossierFlags = {
      privateDossier: true,
      dossierUserId: user.id,
      dossierUserUuid: user.uuid,
      dossierCharacterName: dossier.characterName,
      dossierRevision: String(dossier.revision ?? 1),
      dossierHash: hashSource(dossier)
    };

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

async function openDossierImporter() {
  const { DialogV2 } = foundry.applications.api;
  const formData = await DialogV2.input({
    window: { title: "Import Private Player Dossiers" },
    content: `<div class="lcj-dossier-import">
      <p>Paste a dossier package created with Codex. It may contain one dossier or a <code>dossiers</code> array.</p>
      <p><strong>Privacy:</strong> the pasted text is written directly into restricted Foundry Journals and is not added to the module's public campaign JSON.</p>
      <textarea name="dossierJson" rows="18" placeholder='{"schemaVersion":1,"dossiers":[...]}' autofocus></textarea>
    </div>`,
    ok: { label: "Import dossiers", icon: "fa-solid fa-user-shield" },
    modal: true,
    rejectClose: false
  });
  if (!formData) return [];
  const raw = formData.dossierJson?.trim();
  if (!raw) throw new Error("Paste a dossier package before importing.");
  return importPrivateDossiers(JSON.parse(raw));
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
    return { created: 0, updated: 0, skipped: 0 };
  }

  try {
    const library = await loadLibrary();
    const folders = await ensureFolders();
    const existingById = new Map(managedEntries().map((entry) => [flag(entry, "sourceId"), entry]));
    const results = { created: 0, updated: 0, skipped: 0 };

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

    if (!quiet) info(`Sync complete — ${results.created} created, ${results.updated} updated, ${results.skipped} unchanged.`);
    journalApp?.render();
    return results;
  } catch (exception) {
    error(exception.message);
    throw exception;
  }
}

async function saveProgress(entry, source, progress) {
  await entry.update({ [`flags.${MODULE_ID}.progress`]: progress });
  await upsertPage(entry, source, progress);
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
  const userId = flag(entry, "dossierUserId");
  const user = game.users.get(userId);
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
      changeTab: this._onChangeTab
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dashboard.hbs` }
  };

  activeTab = "quests";

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
    const tabs = [
      { id: "quests", label: "Quest Ledger", icon: "fa-solid fa-scroll", count: quests.length },
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
      lore,
      history,
      privateDossiers,
      hasPrivateDossiers: privateDossiers.length > 0,
      storyActive: this.activeTab === "story",
      canManage: game.user.isGM,
      lastSyncLabel: lastSync ? new Date(lastSync).toLocaleString() : "Never"
    }, { inplace: false });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const search = this.element.querySelector("[data-lcj-search]");
    search?.addEventListener("input", () => this._filterCards(search.value));
  }

  _filterCards(query) {
    const needle = query.trim().toLocaleLowerCase();
    for (const card of this.element.querySelectorAll("[data-lcj-card]")) {
      card.hidden = Boolean(needle) && !card.textContent.toLocaleLowerCase().includes(needle);
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

  static _onChangeTab(_event, target) {
    this.activeTab = target.dataset.tab;
    for (const tab of this.element.querySelectorAll("[data-lcj-tab]")) {
      tab.classList.toggle("active", tab.dataset.tab === this.activeTab);
      tab.setAttribute("aria-selected", String(tab.dataset.tab === this.activeTab));
    }
    for (const panel of this.element.querySelectorAll("[data-lcj-panel]")) {
      panel.hidden = panel.dataset.lcjPanel !== this.activeTab;
    }
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
    name: "Check for updates every (minutes)",
    hint: "Set to 0 to disable background checks. The active GM performs the checks.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: { min: 0, max: 1440, step: 1 },
    default: 5
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
});

Hooks.once("ready", async () => {
  const api = { open: openCampaignJournal, sync: syncLibrary, importDossiers: importPrivateDossiers };
  game.modules.get(MODULE_ID).api = api;
  game.socket.on(SOCKET_CHANNEL, handleQuestAction);

  if (!isPrimaryGm()) return;
  await syncLibrary({ quiet: true }).catch(() => {});
  const minutes = Number(game.settings.get(MODULE_ID, "pollMinutes"));
  if (minutes > 0) {
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncLibrary({ quiet: true }).catch(() => {}), minutes * 60_000);
  }
});

Hooks.on("renderJournalDirectory", addDirectoryButton);
Hooks.on("updateJournalEntry", (entry) => {
  if (flag(entry, "managed") && journalApp?.rendered) journalApp.render();
});
Hooks.on("deleteJournalEntry", (entry) => {
  if (flag(entry, "managed") && journalApp?.rendered) journalApp.render();
});
