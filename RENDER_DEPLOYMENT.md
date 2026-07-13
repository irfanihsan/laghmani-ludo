# Deploy this game to Render

## Recommended deployment: Blueprint with persistent storage

This package contains `render.yaml`, so Render can configure the service automatically.

1. Create a new GitHub repository.
2. Upload **the contents of this folder** to the repository root. Do not upload only the ZIP file.
3. In Render, choose **New → Blueprint**.
4. Connect the GitHub repository.
5. Render reads `render.yaml` and creates the web service.
6. Confirm the service, then deploy it.
7. When deployment finishes, open the generated `onrender.com` address.

Use these pages:

- Main page: `/`
- Host board: `/host`
- Phone controller: `/play`
- Health check: `/health`

## Cost and persistent storage

The Blueprint uses Render's `starter` web-service plan because persistent disks are not available on free web services. The attached 1 GB disk is mounted at `/var/data`, and the application stores active rooms in `/var/data/rooms.json`.

This keeps active rooms after ordinary restarts and redeployments. A disk-backed service runs as a single instance and has brief downtime during deployment.

## Free test deployment

For a temporary free test, edit `render.yaml` before deploying:

1. Change `plan: starter` to `plan: free`.
2. Remove the entire `disk:` section.
3. Change `DATA_DIR` from `/var/data` to `/tmp/ludo-data`.

The game will run, but active rooms will be lost whenever Render restarts, sleeps or redeploys the service. Do not use the free version for matches where recovery matters.

## Manual Render settings

If you create a Web Service manually instead of using the Blueprint:

- Runtime: Node
- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check path: `/health`
- Region: Frankfurt
- Environment variables:
  - `NODE_ENV=production`
  - `DATA_DIR=/var/data`
  - `TURN_TIMEOUT_MS=90000`
  - `ROOM_TTL_MS=43200000`
- Persistent disk:
  - Name: `ludo-data`
  - Mount path: `/var/data`
  - Size: `1 GB`

## Updating the game

Push changes to the connected GitHub branch. Render automatically builds and deploys the new commit. Existing rooms are restored from the persistent disk when the new process starts.
