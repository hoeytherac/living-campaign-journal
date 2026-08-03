import assert from "node:assert/strict";

const onceHooks = new Map();
let nextId = 1;
const makeId = (prefix) => `${prefix}-${nextId++}`;

const player = { id: "player-1", uuid: "User.player-1", documentName: "User", name: "Player One", isGM: false, character: { id: "actor-1", name: "Aurelia" } };
const playerTwo = { id: "player-2", uuid: "User.player-2", documentName: "User", name: "Player Two", isGM: false, character: { id: "actor-2", name: "Caelum" } };
const gm = { id: "gm-1", uuid: "User.gm-1", name: "Game Master", isGM: true };
const actorTwo = { id: "actor-2", uuid: "Actor.actor-2", documentName: "Actor", name: "Caelum", testUserPermission: () => false };
const users = Object.assign(new Map([[player.id, player], [playerTwo.id, playerTwo], [gm.id, gm]]), {
  activeGM: gm,
  find: (predicate) => [...users.values()].find(predicate)
});
const folders = [];
const journals = [];
journals.get = (id) => journals.find((entry) => entry.id === id);

const makePage = (data) => ({
  id: makeId("page"),
  name: data.name,
  sort: data.sort,
  text: { ...(data.text ?? {}) },
  flags: structuredClone(data.flags ?? {}),
  getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
  async update(changes) {
    if (changes.name !== undefined) this.name = changes.name;
    if (changes.sort !== undefined) this.sort = changes.sort;
    if (changes["text.content"] !== undefined) this.text.content = changes["text.content"];
    if (changes["text.format"] !== undefined) this.text.format = changes["text.format"];
    return this;
  }
});

const makeJournal = (data) => {
  const pageContents = [];
  return {
    id: makeId("journal"),
    name: data.name,
    folder: data.folder,
    ownership: structuredClone(data.ownership),
    flags: structuredClone(data.flags ?? {}),
    pages: {
      contents: pageContents,
      find: (predicate) => pageContents.find(predicate)
    },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    async update(changes) {
      Object.assign(this, Object.fromEntries(Object.entries(changes).filter(([key]) => !key.includes("."))));
      return this;
    },
    async createEmbeddedDocuments(_type, records) {
      const created = records.map(makePage);
      pageContents.push(...created);
      return created;
    }
  };
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 },
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }
};
globalThis.document = {
  createElement: () => ({
    _text: "",
    _html: "",
    set textContent(value) { this._text = String(value); },
    get innerHTML() { return this._text || this._html; },
    set innerHTML(value) { this._html = String(value); },
    get textContent() { return this._text || this._html.replace(/<[^>]*>/g, ""); }
  })
};
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {} } },
  utils: {
    deepClone: structuredClone,
    fromUuid: async (uuid) => uuid === player.uuid ? player : uuid === actorTwo.uuid ? actorTwo : null
  }
};
globalThis.Hooks = { once: (name, callback) => onceHooks.set(name, callback), on: () => {} };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.game = {
  user: player,
  users,
  folders,
  journal: journals,
  modules: new Map([["living-campaign-journal", {}]]),
  keybindings: { register: () => {} },
  settings: {
    register: () => {},
    get: (_moduleId, key) => key === "rootFolderName" ? "Campaign Journal" : null
  },
  socket: { on: () => {} }
};
globalThis.Folder = {
  create: async (data) => {
    const folder = { id: makeId("folder"), ...data };
    folders.push(folder);
    return folder;
  }
};
globalThis.JournalEntry = {
  create: async (data) => {
    const journal = makeJournal(data);
    journals.push(journal);
    return journal;
  }
};

await import("../scripts/living-campaign-journal.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();
game.user = gm;

const dossier = {
  playerUuid: player.uuid,
  characterName: "Aurelia",
  backstory: { body: "<p>A private origin.</p>" },
  knowledge: [{ id: "moon-sigil", title: "The Moon Sigil", body: "<p>A private fact.</p>" }]
};
await game.modules.get("living-campaign-journal").api.importDossiers({ schemaVersion: 1, dossiers: [dossier] });

assert.equal(journals.length, 1);
assert.equal(journals[0].ownership.default, CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE);
assert.equal(journals[0].ownership[player.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
assert.equal(journals[0].pages.contents.length, 4);
assert.equal(journals[0].getFlag("living-campaign-journal", "dossierUserId"), player.id);

const notes = journals[0].pages.contents.find((page) => page.getFlag("living-campaign-journal", "dossierPageKey") === "personal-notes");
notes.text.content = "<p>Player-authored note.</p>";
await game.modules.get("living-campaign-journal").api.importDossiers({ dossiers: [{ ...dossier, revision: 2, backstory: { body: "<p>Updated private origin.</p>" } }] });

assert.equal(journals.length, 1);
assert.equal(notes.text.content, "<p>Player-authored note.</p>");
assert.match(journals[0].pages.contents.find((page) => page.getFlag("living-campaign-journal", "dossierPageKey") === "backstory").text.content, /Updated private origin/);

await game.modules.get("living-campaign-journal").api.importDossiers({
  dossiers: [{ playerUuid: actorTwo.uuid, characterName: "Caelum", backstory: { body: "<p>Actor-resolved origin.</p>" }, knowledge: [] }]
});
assert.equal(journals.length, 2);
assert.equal(journals[1].ownership[playerTwo.id], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);

console.log("Private dossier ownership, page creation, UUID resolution, and notes-preservation smoke test passed.");
