import assert from "node:assert/strict";

const onceHooks = new Map();
const persistentHooks = new Map();
const registeredSettings = [];
let socketRegistration;

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
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
  settings: {
    register: (moduleId, key) => registeredSettings.push(`${moduleId}.${key}`)
  },
  socket: {
    on: (channel, callback) => { socketRegistration = { channel, callback }; }
  }
};

await import("../scripts/living-campaign-journal.js");
await onceHooks.get("init")();
await onceHooks.get("ready")();

assert.equal(registeredSettings.length, 5);
assert.equal(socketRegistration.channel, "module.living-campaign-journal");
assert.equal(typeof socketRegistration.callback, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.open, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.sync, "function");
assert.equal(typeof game.modules.get("living-campaign-journal").api.importDossiers, "function");
assert.equal(typeof persistentHooks.get("renderJournalDirectory"), "function");

console.log("Foundry initialization and socket registration smoke test passed.");
