# Contributing

## Validate locally

Use Node.js 22 or newer:

```sh
node --check scripts/world-map-journal-0.7.1.js
node tools/validate.mjs
node tools/smoke-foundry.mjs
node tools/smoke-dossiers.mjs
```

## Release

1. Update `version` and the versioned `download` URL in `module.json`.
2. Add release notes to `CHANGELOG.md`.
3. Commit and push the changes to `main`.
4. Create and publish a GitHub release using a tag matching the manifest version, such as `v0.4.0`.

Publishing the release triggers the GitHub Actions workflow. It validates the module and attaches an installable ZIP plus the stable Foundry `module.json` manifest.

## Campaign content

Keep stable IDs when updating `content/campaign.json`. Private player dossiers must never be committed; see `SECURITY.md`.
