import assert from "node:assert/strict";

const onceHooks = new Map();
const persistentHooks = new Map();
const registeredSettings = [];
const registeredKeybindings = [];
let socketRegistration;
let journalRenderOptions;

globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value)
  },
  applications: {
    api: {
      ApplicationV2: class {
        render(options) { journalRenderOptions = options; }
      },
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};
globalThis.Hooks = {
  once: (name, callback) => onceHooks.set(name, callback),
  on: (name, callback) => persistentHooks.set(name, callback)
};
globalThis.ui = { notifications: {} };
globalThis.game = {
  user: { id: "player-1", isGM: false },
  users: Object.assign(new Map([
    ["player-1", { id: "player-1", isGM: false }],
    ["gm-1", { id: "gm-1", isGM: true }]
  ]), { activeGM: { id: "gm-1" } }),
  modules: new Map([["living-campaign-journal", {}]]),
  keybindings: {
    register: (moduleId, key, config) => registeredKeybindings.push({ moduleId, key, config })
  },
  settings: {
    register: (moduleId, key) => registeredSettings.push(`${moduleId}.${key}`),
    get: (_moduleId, key) => key === "mapPins" ? { schemaVersion: 1, pins: [] } : undefined
  },
  socket: {
    on: (channel, callback) => { socketRegistration = { channel, callback }; }
  }
};

await import("../scripts/world-map-journal-0.6.8.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();

assert.equal(registeredSettings.length, 6);
assert.ok(registeredSettings.includes("living-campaign-journal.mapPins"));
assert.equal(registeredKeybindings.length, 1);
assert.equal(registeredKeybindings[0].moduleId, "living-campaign-journal");
assert.equal(registeredKeybindings[0].key, "openCampaignJournal");
assert.deepEqual(registeredKeybindings[0].config.editable, [{ key: "KeyJ" }]);
assert.equal(typeof registeredKeybindings[0].config.onDown, "function");
assert.equal(registeredKeybindings[0].config.onDown(), true);
assert.deepEqual(journalRenderOptions, { force: true });
assert.equal(socketRegistration.channel, "module.living-campaign-journal");
assert.equal(typeof socketRegistration.callback, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.open, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.sync, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.importDossiers, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.getMapPins, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.setMapPins, "function");
assert.deepEqual(game.modules.get("living-campaign-journal").api.getMapPins(), []);
assert.equal(typeof persistentHooks.get("renderJournalDirectory"), "function");
assert.equal(typeof persistentHooks.get("updateSetting"), "function");

console.log("Foundry initialization, J keybinding, and socket registration smoke test passed.");
