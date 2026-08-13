import assert from "node:assert/strict";

const onceHooks = new Map();
const persistentHooks = new Map();
const registeredSettings = [];
const registeredKeybindings = [];
let socketRegistration;
let journalRenderOptions;
let fetchCalls = 0;
let intervalCalls = 0;

globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error("Startup must not fetch campaign content.");
};
globalThis.setInterval = () => {
  intervalCalls += 1;
  return 1;
};

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
  user: { id: "gm-1", isGM: true },
  users: Object.assign(new Map([
    ["player-1", { id: "player-1", isGM: false }],
    ["gm-1", { id: "gm-1", isGM: true }]
  ]), { activeGM: { id: "gm-1" } }),
  modules: new Map([["living-campaign-journal", {}]]),
  keybindings: {
    register: (moduleId, key, config) => registeredKeybindings.push({ moduleId, key, config })
  },
  settings: {
    register: (moduleId, key, config) => registeredSettings.push({ id: `${moduleId}.${key}`, config }),
    get: (_moduleId, key) => {
      if (key === "mapPins") return { schemaVersion: 1, pins: [] };
      if (key === "sourcePath") return "https://raw.githubusercontent.com/hoeytherac/living-campaign-journal/main/content/campaign.json";
      if (key === "pollMinutes") return 5;
      return undefined;
    },
    set: async () => undefined
  },
  socket: {
    on: (channel, callback) => { socketRegistration = { channel, callback }; }
  }
};

await import("../scripts/world-map-journal-0.6.9.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();

assert.equal(registeredSettings.length, 6);
assert.ok(registeredSettings.some((setting) => setting.id === "living-campaign-journal.mapPins"));
const pollSetting = registeredSettings.find((setting) => setting.id === "living-campaign-journal.pollMinutes");
assert.equal(pollSetting.config.config, false);
assert.equal(pollSetting.config.default, 0);
assert.equal(fetchCalls, 0);
assert.equal(intervalCalls, 0);
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

console.log("Foundry initialization, manual-only synchronization, J keybinding, and socket registration smoke test passed.");
