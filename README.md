# Side-Cars

Smart ride-share web app that matches riders and drivers heading the same way using MongoDB geospatial queries (`$geoNear`, `2dsphere`) and live updates via change streams.

A nearby ride-sharing demo built with Express and MongoDB. It starts around MG Road, Bangalore, with local sample rides and fares in Indian rupees; connect MongoDB to enable the `2dsphere` query and change-stream updates.

## Run

```powershell
npm install
npm start
```

Open http://localhost:3000. The app reads `MONGODB_URI` from `.env`; the included local URI expects MongoDB to be running on this computer. If MongoDB is unavailable, the app uses its local sample rides and local live-event feed after a short connection timeout.

To connect a MongoDB deployment instead, replace `MONGODB_URI` in your local `.env` file with your deployment URI. Keep that file private. `MONGODB_DB` is optional and defaults to `sidecar`. The database user needs permission to create an index, read, and write. Change streams require a replica set or sharded cluster. On first connection, the app creates a `2dsphere` index on `rides.location` and inserts the demo rides if the collection is empty.

Authentication credentials are stored in `sidecar.users`; profile details (name, place, age, address, occupation, gender, and date of birth) are stored separately in `sidecar.profiles`, linked by `userId`. Registration requires MongoDB and consent to save profile details. Passwords are stored as salted hashes, never as plain text. When MongoDB is unavailable, auth routes return an error rather than creating a temporary account. For local development only, `.env` enables 13 example users (existing profiles are not overwritten). The first three have individual passwords; the ten additional users use `SidecarDemo2026!`. Example accounts are not seeded when `NODE_ENV=production`; remove `SEED_DEMO_USERS=true` from `.env` to disable them.

Signed-in passengers can send a ride request with an optional note. Requests are stored in `sidecar.rideRequests`; only the ride owner can accept or decline them from the Requests page. A seat is deducted only when the owner accepts.

Ride search uses `$geoNear` to find pickups within the selected radius, then filters the ride's stored heading in the same aggregation. Coordinates use GeoJSON order: `[longitude, latitude]`.
