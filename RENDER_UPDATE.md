# Deploy this version to Render

Replace the contents of your local GitHub repository with this package, preserving the hidden `.git` folder. Commit and push through GitHub Desktop. Render will redeploy automatically.

Render settings:

- Build command: `npm install --registry=https://registry.npmjs.org --no-audit --no-fund`
- Start command: `npm start`
- Health check: `/health`
- `NODE_VERSION=20.12.2`
- Free testing storage: `DATA_DIR=/tmp/ludo-data`

For persistent active rooms, use a paid Render service with a persistent disk mounted at `/var/data`, then change `DATA_DIR` to `/var/data`.
