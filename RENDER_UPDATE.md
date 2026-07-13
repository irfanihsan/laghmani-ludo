# Updating the Render deployment to the 3D edition

1. Extract the ZIP.
2. Copy all extracted files into the local GitHub repository folder, replacing the existing files. Keep the hidden `.git` folder.
3. Open GitHub Desktop.
4. Commit with: `Add 3D board and server-controlled dice`.
5. Push to `main`.
6. Render will deploy automatically when Auto-Deploy is On Commit.

Keep these Render settings:

- Build command: `npm install --registry=https://registry.npmjs.org --no-audit --no-fund`
- Start command: `npm start`
- Node version environment variable: `NODE_VERSION=20.12.2`
- Health check path: `/health`

The new dice uses the server result and only animates towards that confirmed face. It does not generate its own result in the browser.
