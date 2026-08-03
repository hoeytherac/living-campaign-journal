import assert from "node:assert/strict";

const onceHooks = new Map();
let nextId = 1;
const makeId = (prefix) => `${prefix}-${nextId++}`;

const gm = { id: "gm-1", uuid: "User.gm-1", name: "Game Master", isGM: true, active: true };
const users = Object.assign(new Map([[gm.id, gm]]), { activeGM: gm });
const folders = [];
const journals = [];
journals.get = (id) => journals.find((entry) => entry.id === id);

const makePage = (data) => ({
  id: makeId("page"),
  name: data.name,
  text: { ...(data.text ?? {}) },
  flags: structuredClone(data.flags ?? {}),
  getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
  async update(changes) {
    if (changes.name !== undefined) this.name = changes.name;
    if (changes["text.content"] !== undefined) this.text.content = changes["text.content"];
    return this;
  }
});

const makeJournal = (data) => {
  const pageContents = [];
  const journal = {
    id: makeId("journal"),
    name: data.name,
    folder: data.folder,
    ownership: structuredClone(data.ownership ?? {}),
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
    },
    async delete() {
      const index = journals.indexOf(this);
      if (index >= 0) journals.splice(index, 1);
      return this;
    }
  };
  return journal;
};

const retiredJournal = makeJournal({
  name: "Old Demonstration Quest",
  flags: {
    "living-campaign-journal": {
      managed: true,
      sourceId: "quest-old-demonstration"
    }
  }
});
journals.push(retiredJournal);

const library = {
  schemaVersion: 1,
  campaign: { title: "Retirement Test" },
  retiredEntries: ["quest-old-demonstration"],
  entries: [{
    id: "quest-new-opening",
    type: "quest",
    title: "New Opening Quest",
    visibility: "players",
    quest: { status: "active", objectives: [] }
  }]
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
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(library) });
globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (Base) => class extends Base {} } },
  utils: { deepClone: structuredClone }
};
globalThis.Hooks = { once: (name, callback) => onceHooks.set(name, callback), on: () => {} };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.game = {
  user: gm,
  users,
  folders,
  journal: journals,
  modules: new Map([["living-campaign-journal", {}]]),
  keybindings: { register: () => {} },
  settings: {
    register: () => {},
    get: (_moduleId, key) => ({
      sourcePath: "mock://campaign",
      rootFolderName: "Campaign Journal",
      updateMinutes: 0,
      mapPins: { schemaVersion: 1, pins: [] }
    })[key],
    set: async () => {}
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

await import("../scripts/world-map-journal-0.6.6.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();

assert.equal(journals.some((entry) => entry.getFlag("living-campaign-journal", "sourceId") === "quest-old-demonstration"), false);
assert.equal(journals.some((entry) => entry.getFlag("living-campaign-journal", "sourceId") === "quest-new-opening"), true);

console.log("Explicit retirement deletes only the named managed entry and imports the replacement.");
