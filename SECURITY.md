# Security and private campaign content

Do not commit real player dossiers, character UUIDs, secret backstories, private lore, access tokens, passwords, or `.env` files to this repository.

The blank file in `examples/private-dossier-template.json` demonstrates the format only. Real dossier packages should be produced locally, kept outside the module folder, and pasted into the GM-only importer in Foundry. The importer writes them directly to restricted world Journals.

The bundled `content/campaign.json` is a web-accessible module asset. Treat it as player-readable even when an imported Journal uses GM-only ownership.

If sensitive campaign information is committed accidentally, remove access immediately, rotate any exposed credentials, and rewrite the repository history before distributing another release.
