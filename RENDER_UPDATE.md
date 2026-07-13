# Render update

Replace the existing repository files with this package, commit, and push.
Render will deploy automatically if Auto-Deploy is enabled.

Build command:
`npm install --registry=https://registry.npmjs.org --no-audit --no-fund`

Start command:
`npm start`

Environment variable:
`NODE_VERSION=20.12.2`

Health check:
`/health`

The free Render plan uses temporary storage. For persistent live rooms, upgrade and mount a disk at `/var/data`, then set `DATA_DIR=/var/data`.
