import express from 'express';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MongoClient, ObjectId } from 'mongodb';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const app = express();
const events = new EventEmitter();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'sidecar';
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const defaultOrigin = { lat: 12.9716, lng: 77.5946 };
const demoUsers = [
  { name: 'Maya Sharma', email: 'maya.demo@example.com', password: 'MayaRideDemo2026!', place: 'Bengaluru', age: 28, address: 'Indiranagar, Bengaluru, Karnataka', occupation: 'Product designer', gender: 'Woman', dob: '1998-06-10' },
  { name: 'Arjun Nair', email: 'arjun.demo@example.com', password: 'ArjunRideDemo2026!', place: 'Bengaluru', age: 31, address: 'Koramangala, Bengaluru, Karnataka', occupation: 'Software engineer', gender: 'Man', dob: '1995-03-11' },
  { name: 'Ananya Rao', email: 'ananya.rao.demo@example.com', password: 'AnanyaRideDemo2026!', place: 'Bengaluru', age: 26, address: 'MG Road, Bengaluru, Karnataka', occupation: 'Architect', gender: 'Woman', dob: '2000-01-15' },
  { name: 'Riya Kapoor', email: 'riya.kapoor.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 24, address: 'Jayanagar, Bengaluru, Karnataka', occupation: 'Graphic designer', gender: 'Woman', dob: '2002-04-18' },
  { name: 'Dev Malhotra', email: 'dev.malhotra.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 29, address: 'HSR Layout, Bengaluru, Karnataka', occupation: 'Data analyst', gender: 'Man', dob: '1997-02-08' },
  { name: 'Kavya Iyer', email: 'kavya.iyer.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 27, address: 'Malleshwaram, Bengaluru, Karnataka', occupation: 'Teacher', gender: 'Woman', dob: '1999-07-21' },
  { name: 'Neel Joshi', email: 'neel.joshi.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 33, address: 'Whitefield, Bengaluru, Karnataka', occupation: 'Product manager', gender: 'Man', dob: '1993-05-09' },
  { name: 'Tara Bose', email: 'tara.bose.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 25, address: 'Basavanagudi, Bengaluru, Karnataka', occupation: 'Nurse', gender: 'Woman', dob: '2001-03-14' },
  { name: 'Ishaan Verma', email: 'ishaan.verma.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 30, address: 'Electronic City, Bengaluru, Karnataka', occupation: 'Accountant', gender: 'Man', dob: '1996-09-03' },
  { name: 'Meera Kulkarni', email: 'meera.kulkarni.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 28, address: 'JP Nagar, Bengaluru, Karnataka', occupation: 'Researcher', gender: 'Woman', dob: '1998-05-06' },
  { name: 'Siddharth Rao', email: 'siddharth.rao.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 32, address: 'Rajajinagar, Bengaluru, Karnataka', occupation: 'Civil engineer', gender: 'Man', dob: '1994-01-29' },
  { name: 'Zara Fernandes', email: 'zara.fernandes.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 26, address: 'BTM Layout, Bengaluru, Karnataka', occupation: 'Photographer', gender: 'Woman', dob: '2000-08-13' },
  { name: 'Kiran Patel', email: 'kiran.patel.demo@example.com', password: 'SidecarDemo2026!', place: 'Bengaluru', age: 23, address: 'Yelahanka, Bengaluru, Karnataka', occupation: 'Student', gender: 'Non-binary', dob: '2003-01-30' }
];
const demoRides = [
  { name: 'Ananya Rao', initials: 'AR', from: 'MG Road', to: 'Indiranagar', car: 'White Nexon EV', rating: 4.9, seats: 2, fare: 90, departureMinutes: 3, heading: 92, coordinates: [77.5972, 12.9728], destinationCoordinates: [77.6409, 12.9784] },
  { name: 'Rohan Mehta', initials: 'RM', from: 'Cubbon Park', to: 'Whitefield', car: 'Blue City', rating: 5.0, seats: 1, fare: 120, departureMinutes: 5, heading: 83, coordinates: [77.5988, 12.9751], destinationCoordinates: [77.7500, 12.9698] },
  { name: 'Nisha Kumar', initials: 'NK', from: 'Brigade Road', to: 'Koramangala', car: 'Silver i20', rating: 4.8, seats: 3, fare: 80, departureMinutes: 8, heading: 105, coordinates: [77.5980, 12.9687], destinationCoordinates: [77.6245, 12.9352] },
  { name: 'Arjun Das', initials: 'AD', from: 'Church Street', to: 'Hebbal', car: 'Green Ciaz', rating: 4.9, seats: 2, fare: 140, departureMinutes: 11, heading: 42, coordinates: [77.6003, 12.9766], destinationCoordinates: [77.5970, 13.0358] },
  { name: 'Priya Menon', initials: 'PM', from: 'Residency Road', to: 'Jayanagar', car: 'Red Honda City', rating: 4.7, seats: 1, fare: 110, departureMinutes: 14, heading: 190, coordinates: [77.5914, 12.9692], destinationCoordinates: [77.5821, 12.9250] },
  { name: 'Kabir Shah', initials: 'KS', from: 'Vasanth Nagar', to: 'Marathahalli', car: 'Black EV', rating: 5.0, seats: 2, fare: 125, departureMinutes: 6, heading: 88, coordinates: [77.5903, 12.9754], destinationCoordinates: [77.7012, 12.9591] }
].map((ride, index) => ({
  ...ride,
  ownerEmail: demoUsers[index % 3].email,
  isDemo: true,
  _id: `demo-${index + 1}`,
  location: { type: 'Point', coordinates: ride.coordinates },
  destination: { type: 'Point', coordinates: ride.destinationCoordinates },
  createdAt: new Date().toISOString()
}));

let ridesCollection;
let usersCollection;
let profilesCollection;
let rideRequestsCollection;
let changeStream;
let databaseMode = 'demo';
let liveUpdatesMode = 'local-events';
let localRides = [...demoRides];

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

function publicUser(user, profile) {
  const { userId, ...details } = profile;
  return { id: String(user._id), name: profile.name, email: user.email, profile: details };
}

function sessionSignature(payload) {
  return createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function setSessionCookie(response, userId) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expiresAt}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `sidecar_session=${payload}.${sessionSignature(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', 'sidecar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function readSession(request) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('sidecar_session='));
  if (!cookie) return null;
  const token = cookie.slice('sidecar_session='.length);
  const signatureSeparator = token.lastIndexOf('.');
  const payload = token.slice(0, signatureSeparator);
  const suppliedSignature = token.slice(signatureSeparator + 1);
  if (signatureSeparator < 1) return null;
  const expectedSignature = sessionSignature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  const expirySeparator = payload.lastIndexOf('.');
  const userId = payload.slice(0, expirySeparator);
  const expiresAt = Number(payload.slice(expirySeparator + 1));
  return userId && Number.isFinite(expiresAt) && expiresAt > Date.now() ? userId : null;
}

async function findUserById(userId) {
  if (!usersCollection || !profilesCollection || !ObjectId.isValid(userId)) return null;
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  const profile = await profilesCollection.findOne({ userId: user._id });
  return profile ? { user, profile } : null;
}

async function findSignedInAccount(request) {
  const userId = readSession(request);
  if (!userId) return null;
  return findUserById(userId);
}

app.post('/api/auth/register', async (request, response) => {
  if (!usersCollection || !profilesCollection) return response.status(503).json({ error: 'Account storage is unavailable. Start MongoDB and try again.' });
  const name = String(request.body?.name ?? '').trim().slice(0, 48);
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const password = String(request.body?.password ?? '');
  const place = String(request.body?.place ?? '').trim().slice(0, 80);
  const ageInput = String(request.body?.age ?? '').trim();
  const age = Number(ageInput);
  const address = String(request.body?.address ?? '').trim().slice(0, 200);
  const occupation = String(request.body?.occupation ?? '').trim().slice(0, 80);
  const gender = String(request.body?.gender ?? '').trim();
  const dob = String(request.body?.dob ?? '').trim();
  const profileConsent = request.body?.profileConsent === true || request.body?.profileConsent === 'on';
  const dateOfBirth = new Date(`${dob}T00:00:00.000Z`);
  const now = new Date();
  let calculatedAge = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayHasPassed = now.getUTCMonth() > dateOfBirth.getUTCMonth()
    || (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() >= dateOfBirth.getUTCDate());
  if (!birthdayHasPassed) calculatedAge -= 1;
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128
      || place.length < 2 || !ageInput || !Number.isInteger(age) || age < 0 || age > 120 || age !== calculatedAge || address.length < 5
      || occupation.length < 2 || gender.length < 2 || gender.length > 40 || !profileConsent
      || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(dateOfBirth.getTime())
      || dateOfBirth.toISOString().slice(0, 10) !== dob || dateOfBirth > new Date()) {
    return response.status(400).json({ error: 'Complete each profile field, confirm consent, and ensure age matches your date of birth.' });
  }

  try {
    if (await usersCollection.findOne({ email })) {
      return response.status(409).json({ error: 'An account with this email already exists.' });
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { _id: new ObjectId(), email, salt, passwordHash, createdAt: new Date() };
    const profile = { userId: user._id, name, place, age, address, occupation, gender, dob, consentedAt: new Date(), createdAt: new Date() };
    await usersCollection.insertOne(user);
    try {
      await profilesCollection.insertOne(profile);
    } catch (error) {
      await usersCollection.deleteOne({ _id: user._id });
      throw error;
    }
    setSessionCookie(response, String(user._id));
    return response.status(201).json({ user: publicUser(user, profile) });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: 'An account with this email already exists.' });
    console.error('Could not create account:', error.message);
    return response.status(500).json({ error: 'Could not create your account.' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  if (!usersCollection || !profilesCollection) return response.status(503).json({ error: 'Account storage is unavailable. Start MongoDB and try again.' });
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  const password = String(request.body?.password ?? '');
  if (!email || !password || password.length > 128) return response.status(400).json({ error: 'Enter your email and password.' });

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return response.status(401).json({ error: 'Email or password is incorrect.' });
    const passwordHash = (await scrypt(password, user.salt, 64)).toString('hex');
    const supplied = Buffer.from(passwordHash, 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return response.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const profile = await profilesCollection.findOne({ userId: user._id });
    if (!profile) return response.status(401).json({ error: 'Account profile is incomplete. Contact support.' });
    setSessionCookie(response, String(user._id));
    return response.json({ user: publicUser(user, profile) });
  } catch (error) {
    console.error('Could not log in:', error.message);
    return response.status(500).json({ error: 'Could not log in right now.' });
  }
});

app.get('/api/auth/me', async (request, response) => {
  if (!usersCollection || !profilesCollection) return response.status(503).json({ error: 'Account storage is unavailable.' });
  const userId = readSession(request);
  if (!userId) return response.status(401).json({ error: 'Not signed in.' });
  try {
    const user = await findUserById(userId);
    if (!user) return response.status(401).json({ error: 'Not signed in.' });
    return response.json({ user: publicUser(user.user, user.profile) });
  } catch (error) {
    console.error('Could not load account:', error.message);
    return response.status(500).json({ error: 'Could not load your account.' });
  }
});

app.post('/api/auth/logout', (_request, response) => {
  clearSessionCookie(response);
  response.json({ success: true });
});

function headingDifference(first, second) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

function distanceInKm(first, second) {
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const term = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
}

function parseSearch(query) {
  const lat = Number(query.lat ?? defaultOrigin.lat);
  const lng = Number(query.lng ?? defaultOrigin.lng);
  const radiusKm = Math.min(5, Math.max(0.5, Number(query.radiusKm) || 2));
  const heading = Number(query.heading ?? 90);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(heading)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng, radiusKm, heading: (heading + 360) % 360 };
}

app.get('/api/status', (_request, response) => {
  response.json({ database: databaseMode, liveUpdates: liveUpdatesMode });
});

app.get('/api/rides/nearby', async (request, response) => {
  const search = parseSearch(request.query);
  if (!search) return response.status(400).json({ error: 'Choose a valid location and direction.' });

  try {
    if (ridesCollection) {
      const difference = { $abs: { $subtract: ['$heading', search.heading] } };
      const rides = await ridesCollection.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [search.lng, search.lat] },
            key: 'location',
            distanceField: 'distanceMeters',
            maxDistance: search.radiusKm * 1000,
            spherical: true
          }
        },
        {
          $addFields: {
            headingDelta: { $let: { vars: { difference }, in: { $min: ['$$difference', { $subtract: [360, '$$difference'] }] } } }
          }
        },
        { $match: { headingDelta: { $lte: 50 } } },
        { $sort: { distanceMeters: 1 } },
        { $limit: 30 }
      ]).toArray();
      return response.json(rides.map(ride => ({ ...ride, distanceKm: ride.distanceMeters / 1000 })));
    }

    const rides = localRides.map(ride => {
      const [rideLng, rideLat] = ride.location.coordinates;
      const distanceKm = distanceInKm(search, { lat: rideLat, lng: rideLng });
      return { ...ride, distanceKm, headingDelta: headingDifference(ride.heading, search.heading) };
    }).filter(ride => ride.distanceKm <= search.radiusKm && ride.headingDelta <= 50)
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, 30);
    return response.json(rides);
  } catch (error) {
    console.error('Nearby ride search failed:', error.message);
    return response.status(500).json({ error: 'Ride search is temporarily unavailable.' });
  }
});

app.get('/api/rides/stream', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();
  response.write('event: connected\ndata: {}\n\n');
  const sendUpdate = update => response.write(`data: ${JSON.stringify(update)}\n\n`);
  events.on('ride-update', sendUpdate);
  request.on('close', () => events.off('ride-update', sendUpdate));
});

app.post('/api/rides', async (request, response) => {
  if (!ridesCollection || !usersCollection) return response.status(503).json({ error: 'Ride storage is unavailable. Start MongoDB and try again.' });
  const account = await findSignedInAccount(request);
  if (!account) return response.status(401).json({ error: 'Sign in before offering a ride.' });
  const { name, from, to, car, seats, fare, lat, lng, destLat, destLng, heading } = request.body ?? {};
  const ride = {
    name: String(name ?? '').trim().slice(0, 48),
    from: String(from ?? '').trim().slice(0, 48),
    to: String(to ?? '').trim().slice(0, 48),
    car: String(car ?? 'Car').trim().slice(0, 48),
    initials: String(name ?? 'R').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    rating: 5.0,
    seats: Math.min(6, Math.max(1, Number(seats) || 1)),
    fare: Math.min(9999, Math.max(0, Number(fare) || 0)),
    departureMinutes: 2,
    heading: (Number(heading) + 360) % 360,
    location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    destination: { type: 'Point', coordinates: [Number(destLng), Number(destLat)] },
    ownerId: account.user._id,
    ownerEmail: account.user.email,
    createdAt: new Date().toISOString()
  };
  if (!ride.name || !ride.from || !ride.to || !Number.isFinite(ride.location.coordinates[0])
      || !Number.isFinite(ride.location.coordinates[1]) || !Number.isFinite(ride.destination.coordinates[0])
      || !Number.isFinite(ride.destination.coordinates[1]) || !Number.isFinite(ride.heading)
      || ride.location.coordinates[0] < -180 || ride.location.coordinates[0] > 180
      || ride.location.coordinates[1] < -90 || ride.location.coordinates[1] > 90
      || ride.destination.coordinates[0] < -180 || ride.destination.coordinates[0] > 180
      || ride.destination.coordinates[1] < -90 || ride.destination.coordinates[1] > 90) {
    return response.status(400).json({ error: 'Add your name, route, and valid pickup and destination locations.' });
  }

  try {
    const result = await ridesCollection.insertOne(ride);
    ride._id = result.insertedId.toString();
    events.emit('ride-update', { type: 'ride-added' });
    return response.status(201).json(ride);
  } catch (error) {
    console.error('Could not publish ride:', error.message);
    return response.status(500).json({ error: 'Could not publish this ride.' });
  }
});

app.post('/api/rides/:rideId/requests', async (request, response) => {
  if (!ridesCollection || !usersCollection || !rideRequestsCollection) {
    return response.status(503).json({ error: 'Ride request storage is unavailable.' });
  }
  const account = await findSignedInAccount(request);
  if (!account) return response.status(401).json({ error: 'Sign in to request a seat.' });
  if (!ObjectId.isValid(request.params.rideId)) return response.status(404).json({ error: 'Ride not found.' });

  try {
    const rideId = new ObjectId(request.params.rideId);
    const ride = await ridesCollection.findOne({ _id: rideId });
    if (!ride) return response.status(404).json({ error: 'Ride not found.' });
    if (String(ride.ownerId) === String(account.user._id)) {
      return response.status(409).json({ error: 'You cannot request your own ride.' });
    }
    if (ride.seats < 1) return response.status(409).json({ error: 'No seats remain on this ride.' });
    const existingRequest = await rideRequestsCollection.findOne({
      rideId,
      riderId: account.user._id,
      activeRequest: true
    });
    if (existingRequest) return response.status(409).json({ error: 'You already have an active request for this ride.' });

    const rideRequest = {
      rideId,
      ownerId: ride.ownerId,
      riderId: account.user._id,
      message: String(request.body?.message ?? '').trim().slice(0, 300),
      status: 'pending',
      activeRequest: true,
      createdAt: new Date(),
      respondedAt: null
    };
    const result = await rideRequestsCollection.insertOne(rideRequest);
    events.emit('ride-update', { type: 'ride-requested' });
    return response.status(201).json({ requestId: String(result.insertedId), status: 'pending', message: 'Request sent to the ride owner.' });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: 'You already have an active request for this ride.' });
    console.error('Could not request ride:', error.message);
    return response.status(500).json({ error: 'Could not send your ride request.' });
  }
});

app.get('/api/requests/received', async (request, response) => {
  if (!rideRequestsCollection || !ridesCollection || !profilesCollection) {
    return response.status(503).json({ error: 'Ride request storage is unavailable.' });
  }
  const account = await findSignedInAccount(request);
  if (!account) return response.status(401).json({ error: 'Sign in to see ride requests.' });

  try {
    const requests = await rideRequestsCollection.find({ ownerId: account.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const results = await Promise.all(requests.map(async rideRequest => {
      const [ride, rider] = await Promise.all([
        ridesCollection.findOne({ _id: rideRequest.rideId }),
        findUserById(String(rideRequest.riderId))
      ]);
      if (!ride || !rider) return null;
      return {
        id: String(rideRequest._id),
        status: rideRequest.status,
        message: rideRequest.message,
        createdAt: rideRequest.createdAt,
        respondedAt: rideRequest.respondedAt,
        rider: {
          name: rider.profile.name,
          place: rider.profile.place,
          age: rider.profile.age,
          occupation: rider.profile.occupation
        },
        ride: { from: ride.from, to: ride.to, fare: ride.fare, seats: ride.seats }
      };
    }));
    return response.json(results.filter(Boolean));
  } catch (error) {
    console.error('Could not load ride requests:', error.message);
    return response.status(500).json({ error: 'Could not load ride requests.' });
  }
});

app.patch('/api/requests/:requestId/respond', async (request, response) => {
  if (!rideRequestsCollection || !ridesCollection) {
    return response.status(503).json({ error: 'Ride request storage is unavailable.' });
  }
  const account = await findSignedInAccount(request);
  if (!account) return response.status(401).json({ error: 'Sign in to respond to ride requests.' });
  if (!ObjectId.isValid(request.params.requestId)) return response.status(404).json({ error: 'Request not found.' });
  const decision = request.body?.decision;
  if (!['accept', 'decline'].includes(decision)) return response.status(400).json({ error: 'Choose accept or decline.' });

  try {
    const requestId = new ObjectId(request.params.requestId);
    const filter = { _id: requestId, ownerId: account.user._id, status: 'pending' };
    if (decision === 'decline') {
      const declined = await rideRequestsCollection.findOneAndUpdate(
        filter,
        { $set: { status: 'declined', activeRequest: false, respondedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!declined) return response.status(409).json({ error: 'This request was already answered.' });
      events.emit('ride-update', { type: 'ride-request-declined' });
      return response.json({ status: 'declined', message: 'Request declined.' });
    }

    const claimed = await rideRequestsCollection.findOneAndUpdate(
      filter,
      { $set: { status: 'accepting' } },
      { returnDocument: 'after' }
    );
    if (!claimed) return response.status(409).json({ error: 'This request was already answered.' });
    const ride = await ridesCollection.findOneAndUpdate(
      { _id: claimed.rideId, ownerId: account.user._id, seats: { $gt: 0 } },
      { $inc: { seats: -1 } },
      { returnDocument: 'after' }
    );
    if (!ride) {
      await rideRequestsCollection.updateOne(
        { _id: requestId, status: 'accepting' },
        { $set: { status: 'pending' } }
      );
      return response.status(409).json({ error: 'No seats remain on this ride.' });
    }
    await rideRequestsCollection.updateOne(
      { _id: requestId, status: 'accepting' },
      { $set: { status: 'accepted', activeRequest: false, respondedAt: new Date() } }
    );
    events.emit('ride-update', { type: 'ride-request-accepted' });
    return response.json({ status: 'accepted', message: 'Request accepted.', seats: ride.seats });
  } catch (error) {
    console.error('Could not respond to ride request:', error.message);
    return response.status(500).json({ error: 'Could not respond to this request.' });
  }
});

async function start() {
  if (mongoUri) {
    try {
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      ridesCollection = client.db(databaseName).collection('rides');
      usersCollection = client.db(databaseName).collection('users');
      profilesCollection = client.db(databaseName).collection('profiles');
      rideRequestsCollection = client.db(databaseName).collection('rideRequests');
      await ridesCollection.createIndex({ location: '2dsphere' });
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      await profilesCollection.createIndex({ userId: 1 }, { unique: true });
      await rideRequestsCollection.createIndex(
        { rideId: 1, riderId: 1 },
        { unique: true, partialFilterExpression: { activeRequest: true } }
      );
      await rideRequestsCollection.createIndex({ ownerId: 1, createdAt: -1 });
      if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_USERS === 'true') {
        for (const { password, ...demoUser } of demoUsers) {
          const salt = randomBytes(16).toString('hex');
          const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
          await usersCollection.updateOne(
            { email: demoUser.email },
            { $setOnInsert: { email: demoUser.email, salt, passwordHash, isDemo: true, createdAt: new Date() }, $unset: { name: '' } },
            { upsert: true }
          );
          const user = await usersCollection.findOne({ email: demoUser.email });
          const { password: _password, email: _email, ...profileDetails } = demoUser;
          await profilesCollection.updateOne(
            { userId: user._id },
            { $setOnInsert: { userId: user._id, ...profileDetails, isDemo: true, createdAt: new Date() } },
            { upsert: true }
          );
        }
        console.log(`Ensured ${demoUsers.length} example accounts in ${databaseName}.users`);
      }
      if (await ridesCollection.estimatedDocumentCount() === 0) {
        await ridesCollection.insertMany(demoRides.map(({ _id, coordinates, destinationCoordinates, ...ride }) => ride));
      }
      const demoOwners = await usersCollection.find(
        { email: { $in: demoUsers.slice(0, 3).map(user => user.email) } },
        { projection: { email: 1 } }
      ).toArray();
      const demoOwnerIds = new Map(demoOwners.map(user => [user.email, user._id]));
      for (const demoRide of demoRides) {
        const ownerId = demoOwnerIds.get(demoRide.ownerEmail);
        if (ownerId) {
          await ridesCollection.updateOne(
            { from: demoRide.from, to: demoRide.to, ownerId: { $exists: false } },
            { $set: { ownerId, ownerEmail: demoRide.ownerEmail, isDemo: true } }
          );
        }
      }
      changeStream = ridesCollection.watch([], { fullDocument: 'updateLookup' });
      changeStream.on('change', () => events.emit('ride-update', { type: 'ride-changed' }));
      changeStream.on('error', error => {
        liveUpdatesMode = 'local-events';
        console.error('MongoDB change stream unavailable; using local events:', error.message);
      });
      databaseMode = 'mongodb';
      liveUpdatesMode = 'change-stream';
      console.log(`Connected to MongoDB (${databaseName}.rides)`);
    } catch (error) {
      console.error('MongoDB unavailable; using demo rides:', error.message);
      ridesCollection = undefined;
    }
  }

  app.listen(port, () => console.log(`Sidecar is ready at http://localhost:${port}`));
}

start();