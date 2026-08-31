import assert from "node:assert/strict";

const onceHooks = new Map();
const persistentHooks = new Map();
const registeredSettings = [];
const registeredKeybindings = [];
const storedSettings = new Map([
  ["mapPins", { schemaVersion: 1, pins: [] }],
  ["artworkGallery", { schemaVersion: 1, entries: [] }],
  ["sourcePath", "https://raw.githubusercontent.com/hoeytherac/living-campaign-journal/main/content/campaign.json"],
  ["pollMinutes", 5]
]);
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
    get: (_moduleId, key) => storedSettings.get(key),
    set: async (_moduleId, key, value) => storedSettings.set(key, value)
  },
  socket: {
    on: (channel, callback) => { socketRegistration = { channel, callback }; }
  }
};

await import("../scripts/world-map-journal-0.7.0.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();

assert.equal(registeredSettings.length, 7);
assert.ok(registeredSettings.some((setting) => setting.id === "living-campaign-journal.mapPins"));
assert.ok(registeredSettings.some((setting) => setting.id === "living-campaign-journal.artworkGallery"));
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
assert.equal(typeof game.modules.get("living-campaign-journal").api.getArtwork, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.setArtwork, "function");
assert.deepEqual(game.modules.get("living-campaign-journal").api.getMapPins(), []);
assert.deepEqual(game.modules.get("living-campaign-journal").api.getArtwork(), []);
const savedArtwork = await game.modules.get("living-campaign-journal").api.setArtwork([{
  id: "art-1",
  path: "worlds/test/artwork/first-steps.webp",
  title: "The First Steps",
  caption: "One hundred pilgrims entered.",
  session: "Session 1",
  tags: "pilgrims, Feyrandralis"
}]);
assert.deepEqual(savedArtwork[0].tags, ["pilgrims", "Feyrandralis"]);
assert.equal(game.modules.get("living-campaign-journal").api.getArtwork()[0].title, "The First Steps");
assert.equal(typeof persistentHooks.get("renderJournalDirectory"), "function");
assert.equal(typeof persistentHooks.get("updateSetting"), "function");

console.log("Foundry initialization, artwork album, manual-only synchronization, J keybinding, and socket registration smoke test passed.");
