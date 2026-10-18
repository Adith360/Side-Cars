const initialPosition = { lat: 12.9716, lng: 77.5946 };
let currentPosition = { ...initialPosition };
let map;
let rideLayers = [];
let selectedRideId = null;
let originMarker;
let searchTimer;
const routeCache = new Map();
const routeColors = ['#287451', '#e77b4d', '#397c9a', '#aa7434', '#626bb2', '#b65369'];

const feed = document.querySelector('#ride-feed');
const count = document.querySelector('#result-count');
const emptyState = document.querySelector('#empty-state');
const headingSelect = document.querySelector('#heading-select');
const radiusRange = document.querySelector('#radius-range');
const dialog = document.querySelector('#offer-dialog');
const offerForm = document.querySelector('#offer-form');
const destinationSelect = document.querySelector('#destination-select');
const rideDialog = document.querySelector('#ride-dialog');
const reserveButton = document.querySelector('#reserve-seat');
const requestButton = reserveButton;
const accountForm = document.querySelector('#account-form');
const accountProfileFields = document.querySelector('#account-profile-fields');
const accountProfileControls = [...accountProfileFields.querySelectorAll('input, select')];
const accountPasswordInput = accountForm.elements.password;
const accountFeedback = document.querySelector('#account-feedback');
const accountSubmit = document.querySelector('#account-submit');
const accountFormView = document.querySelector('#account-form-view');
const accountConfirmation = document.querySelector('#account-confirmation');
const accountNavLink = document.querySelector('#account-nav-link');
const requestsNavLink = document.querySelector('#requests-nav-link');
const requestList = document.querySelector('#request-list');
const requestsEmpty = document.querySelector('#requests-empty');
const requestsFeedback = document.querySelector('#requests-feedback');
const requestMessage = document.querySelector('#request-message');
let visibleRides = [];
let activeRideId = null;
let rideEvents;
let currentUser = null;
let authMode = 'register';

function readPreferences() {
  try {
    return { radiusKm: '2', heading: '90', liveUpdates: true, ...JSON.parse(localStorage.getItem('sidecar.preferences') || '{}') };
  } catch {
    return { radiusKm: '2', heading: '90', liveUpdates: true };
  }
}

const preferences = readPreferences();
const settingsHeading = document.querySelector('#settings-heading');
const settingsRadius = document.querySelector('#settings-radius');
const liveUpdatesToggle = document.querySelector('#live-updates-toggle');

function savePreferences() {
  preferences.heading = headingSelect.value;
  preferences.radiusKm = radiusRange.value;
  preferences.liveUpdates = liveUpdatesToggle.checked;
  settingsHeading.value = preferences.heading;
  settingsRadius.value = preferences.radiusKm;
  document.querySelector('#settings-radius-value').textContent = preferences.radiusKm;
  try {
    localStorage.setItem('sidecar.preferences', JSON.stringify(preferences));
  } catch { /* Keep the current settings for this page session. */ }
  document.querySelector('#settings-saved').textContent = 'Saved just now on this device.';
}

function setLiveUpdates(enabled) {
  if (enabled && 'EventSource' in window && !rideEvents) {
    rideEvents = new EventSource('/api/rides/stream');
    rideEvents.onmessage = () => loadRides();
  } else if (!enabled && rideEvents) {
    rideEvents.close();
    rideEvents = undefined;
  }
  document.querySelector('#live-label').textContent = enabled ? 'Live nearby' : 'Updates paused';
}

function showPage() {
  const requestedPage = location.hash.slice(1);
  const page = ['settings', 'about', 'account', 'requests'].includes(requestedPage) ? requestedPage : 'rides';
  document.querySelectorAll('.app-page').forEach(section => {
    section.hidden = section.dataset.page !== page;
  });
  document.querySelectorAll('[data-page-link]').forEach(link => {
    if (link.dataset.pageLink === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = page === 'rides' ? 'Sidecar — rides going your way' : `Sidecar — ${page === 'settings' ? 'Settings' : page === 'about' ? 'About' : page === 'requests' ? 'Ride requests' : 'Account'}`;
  if (page === 'rides') requestAnimationFrame(() => map?.invalidateSize());
  if (page === 'requests') loadIncomingRequests();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatDistance(distanceKm) {
  return distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 1000 / 10) * 10)} m` : `${distanceKm.toFixed(1)} km`;
}

function getDrivingRoute(start, destination) {
  const key = `${start.join(',')};${destination.join(',')}`;
  if (!routeCache.has(key)) {
    const coordinates = `${start.join(',')};${destination.join(',')}`;
    const request = fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(5000) })
      .then(response => response.ok ? response.json() : null)
      .then(data => data?.routes?.[0]?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? null)
      .catch(() => null);
    routeCache.set(key, request);
  }
  return routeCache.get(key);
}

function bearingBetween(start, destination) {
  const radians = value => value * Math.PI / 180;
  const latitude = radians(start.lat);
  const destinationLatitude = radians(destination.lat);
  const longitudeDelta = radians(destination.lng - start.lng);
  const y = Math.sin(longitudeDelta) * Math.cos(destinationLatitude);
  const x = Math.cos(latitude) * Math.sin(destinationLatitude)
    - Math.sin(latitude) * Math.cos(destinationLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function selectRide(rideId) {
  selectedRideId = rideId;
  document.querySelectorAll('.ride-card').forEach(card => {
    const selected = card.dataset.rideId === rideId;
    card.classList.toggle('is-selected', selected);
    card.classList.toggle('route-dimmed', Boolean(rideId) && !selected);
    card.setAttribute('aria-pressed', String(selected));
  });

  for (const layer of rideLayers) {
    const selected = layer.rideId === rideId;
    if (layer.routeRole === 'route') {
      layer.setStyle({ opacity: selected ? 1 : 0.48, weight: selected ? 8 : 4 });
    } else if (layer.routeRole === 'destination') {
      layer.setStyle({ opacity: selected ? 1 : 0.55, fillOpacity: selected ? 1 : 0.55, radius: selected ? 8 : 6 });
    } else {
      layer.setOpacity(selected ? 1 : 0.65);
    }
  }

  const selectedRoute = rideLayers.filter(layer => layer.rideId === rideId);
  const bounds = L.featureGroup(selectedRoute).getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: true });
}

function initMap() {
  if (!window.L) {
    document.querySelector('#map').innerHTML = '<div class="map-unavailable">Map tiles are unavailable. Nearby rides are still listed.</div>';
    return;
  }
  map = L.map('map', { zoomControl: false, scrollWheelZoom: false }).setView([currentPosition.lat, currentPosition.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  originMarker = L.marker([currentPosition.lat, currentPosition.lng], {
    icon: L.divIcon({ className: '', html: '<div class="origin-marker"></div>', iconSize: [19, 19], iconAnchor: [9, 9] }),
    zIndexOffset: 1000
  }).addTo(map).bindTooltip('You are here');
}

function renderRides(rides) {
  visibleRides = rides;
  count.textContent = rides.length;
  feed.innerHTML = rides.map((ride, index) => `
    <article class="ride-card${String(ride._id) === selectedRideId ? ' is-selected' : ''}" data-ride-id="${escapeHtml(ride._id)}" role="button" tabindex="0" aria-pressed="${String(ride._id) === selectedRideId}" style="--route-color:${routeColors[index % routeColors.length]};animation-delay:${Math.min(index * 45, 250)}ms">
      <div class="avatar">${escapeHtml(ride.initials || ride.name?.split(/\s+/).map(part => part[0]).join('').slice(0, 2))}</div>
      <div class="ride-main">
        <div class="driver-line"><i class="route-swatch" aria-hidden="true"></i><span class="driver-name">${escapeHtml(ride.name)}</span><span class="rating">★ ${Number(ride.rating || 5).toFixed(1)}</span></div>
        <div class="route-line"><strong>${escapeHtml(ride.from)}</strong> <span aria-hidden="true">→</span> ${escapeHtml(ride.to)}</div>
        <div class="ride-meta"><span class="seat-count">${Number(ride.seats)} seat${Number(ride.seats) === 1 ? '' : 's'} open</span><span>${escapeHtml(ride.car || 'Car')}</span><span>${formatDistance(Number(ride.distanceKm) || 0)} away</span></div>
      </div>
      <div class="ride-price"><strong>₹${Number(ride.fare || 0)}</strong><span>${Number(ride.departureMinutes || 2)} min</span></div>
    </article>`).join('');
  emptyState.hidden = rides.length !== 0;
  feed.hidden = rides.length === 0;

  rideLayers.forEach(layer => layer.remove());
  rideLayers = [];
  if (map) {
    const bounds = [];
    rides.forEach((ride, index) => {
      const [lng, lat] = ride.location.coordinates;
      const destination = ride.destination?.coordinates;
      if (!destination || destination.length !== 2) return;
      const [destinationLng, destinationLat] = destination;
      const pickupPoint = [lat, lng];
      const dropoffPoint = [destinationLat, destinationLng];
      const color = routeColors[index % routeColors.length];
      bounds.push(pickupPoint, dropoffPoint);
      const route = L.polyline([pickupPoint, dropoffPoint], { color, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(ride.name)}</strong><br>${escapeHtml(ride.from)} → ${escapeHtml(ride.to)}`);
      route.rideId = String(ride._id);
      route.routeRole = 'route';
      route.on('click', () => selectRide(String(ride._id)));
      rideLayers.push(route);
      getDrivingRoute([lng, lat], destination).then(roadPoints => {
        if (roadPoints && rideLayers.includes(route)) route.setLatLngs(roadPoints);
      });
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: `<div class="ride-marker" style="background:${color}"><span>↗</span></div>`, iconSize: [28, 28], iconAnchor: [10, 25] })
      }).addTo(map);
      marker.rideId = String(ride._id);
      marker.routeRole = 'pickup';
      marker.on('click', () => selectRide(String(ride._id)));
      marker.bindPopup(`<strong>${escapeHtml(ride.name)}</strong><br>${escapeHtml(ride.from)} → ${escapeHtml(ride.to)}<br>₹${Number(ride.fare || 0)} · ${Number(ride.seats)} seat${Number(ride.seats) === 1 ? '' : 's'}`);
      rideLayers.push(marker);
      const dropoffMarker = L.circleMarker(dropoffPoint, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(`${escapeHtml(ride.to)} · ${escapeHtml(ride.name)}`);
      dropoffMarker.rideId = String(ride._id);
      dropoffMarker.routeRole = 'destination';
      dropoffMarker.on('click', () => selectRide(String(ride._id)));
      rideLayers.push(dropoffMarker);
    });
    const selectedRoute = rideLayers.filter(layer => layer.rideId === selectedRideId);
    const selectedBounds = selectedRoute.length ? L.featureGroup(selectedRoute).getBounds() : null;
    if (selectedBounds?.isValid()) map.fitBounds(selectedBounds, { padding: [70, 70], maxZoom: 16 });
    else if (bounds.length) map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
    if (selectedRideId) selectRide(selectedRideId);
  }
}

async function loadRides() {
  const parameters = new URLSearchParams({
    lat: currentPosition.lat,
    lng: currentPosition.lng,
    radiusKm: preferences.radiusKm,
    heading: preferences.heading
  });
  try {
    const response = await fetch(`/api/rides/nearby?${parameters}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load nearby rides.');
    renderRides(payload);
  } catch {
    feed.innerHTML = '<p class="load-error">Could not connect to the ride service. Refresh to try again.</p>';
    feed.hidden = false;
    emptyState.hidden = true;
  }
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    const isMongo = status.database === 'mongodb';
    const changeStreamAvailable = status.liveUpdates === 'change-stream';
    document.querySelector('#data-mode').textContent = isMongo ? 'MONGODB CONNECTED' : 'DEMO MODE';
    document.querySelector('#live-label').textContent = preferences.liveUpdates ? (changeStreamAvailable ? 'Live updates on' : 'Live nearby') : 'Updates paused';
  } catch { /* The ride list can still show its connection error. */ }
}

function setPosition(lat, lng, label) {
  currentPosition = { lat, lng };
  document.querySelector('#location-label').textContent = label;
  if (originMarker) originMarker.setLatLng([lat, lng]);
  if (map) map.flyTo([lat, lng], 14, { duration: 0.7 });
  loadRides();
}

function openOfferDialog() {
  if (!currentUser) {
    location.hash = '#account';
    setAuthMode('login');
    accountFeedback.textContent = 'Sign in before offering a ride.';
    return;
  }
  document.querySelector('#form-note').textContent = 'Pickup is your current map pin; the selected destination sets the route.';
  dialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
  });
  accountProfileFields.hidden = !registering;
  accountProfileControls.forEach(control => {
    control.required = registering;
  });
  accountPasswordInput.autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#account-title').textContent = registering ? 'Welcome aboard.' : 'Welcome back.';
  document.querySelector('.account-intro').textContent = registering ? 'Save your details and get going.' : 'Log in to get back on your way.';
  accountSubmit.innerHTML = registering ? 'Create my account <span>↗</span>' : 'Log in <span>↗</span>';
  accountFeedback.textContent = '';
}

function updateAccountView() {
  accountFormView.hidden = Boolean(currentUser);
  accountConfirmation.hidden = !currentUser;
  accountNavLink.textContent = currentUser ? currentUser.name.split(/\s+/)[0] : 'Sign in';
  requestsNavLink.hidden = !currentUser;
  if (currentUser) {
    document.querySelector('#account-user-name').textContent = currentUser.name.split(/\s+/)[0];
    if (location.hash === '#requests') loadIncomingRequests();
  }
}

async function loadCurrentUser() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) return;
    const result = await response.json();
    currentUser = result.user;
    updateAccountView();
    if (location.hash === '#requests') loadIncomingRequests();
  } catch { /* Keep the sign-in form available while offline. */ }
}

async function loadIncomingRequests() {
  if (!currentUser) {
    requestList.hidden = true;
    requestsEmpty.hidden = true;
    requestsFeedback.textContent = 'Sign in to review requests for your rides.';
    return;
  }
  requestsFeedback.textContent = 'Loading requests…';
  try {
    const response = await fetch('/api/requests/received');
    const requests = await response.json();
    if (!response.ok) throw new Error(requests.error || 'Could not load ride requests.');
    requestList.innerHTML = requests.map(item => {
      const pending = item.status === 'pending';
      const statusLabel = item.status === 'accepted' ? 'Accepted' : item.status === 'declined' ? 'Declined' : 'Awaiting your reply';
      return `<article class="incoming-request" data-request-id="${escapeHtml(item.id)}">
        <div class="incoming-request-head">
          <div class="incoming-avatar">${escapeHtml(item.rider.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</div>
          <div class="incoming-person"><strong>${escapeHtml(item.rider.name)}</strong><span>${escapeHtml(item.rider.age)} · ${escapeHtml(item.rider.occupation)} · ${escapeHtml(item.rider.place)}</span></div>
          <span class="request-status status-${escapeHtml(item.status)}">${statusLabel}</span>
        </div>
        <div class="incoming-route"><span>${escapeHtml(item.ride.from)}</span><b>→</b><span>${escapeHtml(item.ride.to)}</span><strong>₹${Number(item.ride.fare)} / seat</strong></div>
        ${item.message ? `<p class="incoming-message">“${escapeHtml(item.message)}”</p>` : ''}
        ${pending ? `<div class="request-actions"><button type="button" data-request-decision="decline">Decline</button><button type="button" class="accept-request" data-request-decision="accept">Accept request</button></div>` : ''}
      </article>`;
    }).join('');
    requestList.hidden = requests.length === 0;
    requestsEmpty.hidden = requests.length !== 0;
    requestsFeedback.textContent = requests.length ? `${requests.filter(item => item.status === 'pending').length} awaiting your reply` : '';
  } catch (error) {
    requestList.hidden = true;
    requestsEmpty.hidden = true;
    requestsFeedback.textContent = error.message;
  }
}

function openRideDetails(ride) {
  activeRideId = String(ride._id);
  selectRide(activeRideId);
  const ownRide = currentUser && String(ride.ownerId) === currentUser.id;
  const hasSeats = Number(ride.seats) > 0;
  document.querySelector('#detail-avatar').textContent = ride.initials || ride.name?.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
  document.querySelector('#ride-detail-name').textContent = ride.name;
  document.querySelector('#ride-detail-rating').textContent = `★ ${Number(ride.rating || 5).toFixed(1)}`;
  document.querySelector('#ride-detail-car').textContent = ride.car || 'Car';
  document.querySelector('#ride-detail-fare').textContent = `₹${Number(ride.fare || 0)}`;
  document.querySelector('#ride-detail-from').textContent = ride.from;
  document.querySelector('#ride-detail-to').textContent = ride.to;
  document.querySelector('#ride-detail-seats').textContent = `${Number(ride.seats)} seat${Number(ride.seats) === 1 ? '' : 's'} open`;
  document.querySelector('#ride-detail-distance').textContent = `${formatDistance(Number(ride.distanceKm) || 0)} away`;
  document.querySelector('#ride-detail-time').textContent = `${Number(ride.departureMinutes || 2)} min`;
  requestMessage.value = '';
  document.querySelector('#ride-request-note').textContent = ownRide
    ? 'This is your ride.'
    : hasSeats ? (currentUser ? 'Send the driver a request to join.' : 'Sign in to request a seat.') : 'No seats remain on this ride.';
  requestButton.disabled = ownRide || !hasSeats;
  requestButton.innerHTML = ownRide ? 'Your ride' : hasSeats ? 'Request to join <span>↗</span>' : 'No seats left';
  rideDialog.showModal();
}

feed.addEventListener('click', event => {
  const card = event.target.closest('.ride-card');
  const ride = visibleRides.find(candidate => String(candidate._id) === card?.dataset.rideId);
  if (ride) openRideDetails(ride);
});
feed.addEventListener('keydown', event => {
  const card = event.target.closest('.ride-card');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    const ride = visibleRides.find(candidate => String(candidate._id) === card.dataset.rideId);
    if (ride) openRideDetails(ride);
  }
});

document.querySelector('#close-ride-details').addEventListener('click', () => rideDialog.close());
requestButton.addEventListener('click', async () => {
  if (!currentUser) {
    rideDialog.close();
    location.hash = '#account';
    setAuthMode('login');
    accountFeedback.textContent = 'Sign in to request a seat.';
    return;
  }
  if (!activeRideId) return;
  requestButton.disabled = true;
  document.querySelector('#ride-request-note').textContent = 'Sending your request…';
  try {
    const response = await fetch(`/api/rides/${encodeURIComponent(activeRideId)}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: requestMessage.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send this request.');
    document.querySelector('#ride-request-note').textContent = result.message;
    requestButton.innerHTML = 'Request sent <span>✓</span>';
  } catch (error) {
    document.querySelector('#ride-request-note').textContent = error.message;
    requestButton.disabled = false;
  }
});

requestList.addEventListener('click', async event => {
  const button = event.target.closest('[data-request-decision]');
  const card = button?.closest('[data-request-id]');
  if (!button || !card) return;
  button.disabled = true;
  requestsFeedback.textContent = 'Saving your response…';
  try {
    const response = await fetch(`/api/requests/${encodeURIComponent(card.dataset.requestId)}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: button.dataset.requestDecision })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save your response.');
    await loadIncomingRequests();
    await loadRides();
  } catch (error) {
    requestsFeedback.textContent = error.message;
    button.disabled = false;
  }
});
document.querySelector('#refresh-requests').addEventListener('click', loadIncomingRequests);

document.querySelectorAll('[data-auth-mode]').forEach(button => {
  button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});
accountForm.addEventListener('submit', async event => {
  event.preventDefault();
  accountSubmit.disabled = true;
  accountFeedback.textContent = authMode === 'register' ? 'Creating your account…' : 'Logging in…';
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(accountForm).entries()))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not sign in.');
    currentUser = result.user;
    accountForm.reset();
    updateAccountView();
  } catch (error) {
    accountFeedback.textContent = error.message;
  } finally {
    accountSubmit.disabled = false;
  }
});
document.querySelector('#account-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  setAuthMode('login');
  updateAccountView();
});

document.querySelector('#open-offer').addEventListener('click', openOfferDialog);
document.querySelector('#empty-offer').addEventListener('click', openOfferDialog);
document.querySelector('#close-offer').addEventListener('click', () => dialog.close());
document.querySelector('#refresh-rides').addEventListener('click', loadRides);
document.querySelector('#center-map').addEventListener('click', () => map?.flyTo([currentPosition.lat, currentPosition.lng], 14));
headingSelect.addEventListener('change', () => {
  savePreferences();
  loadRides();
});
radiusRange.addEventListener('input', () => {
  document.querySelector('#radius-value').textContent = radiusRange.value;
  savePreferences();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRides, 120);
});
settingsHeading.addEventListener('change', () => {
  headingSelect.value = settingsHeading.value;
  savePreferences();
  loadRides();
});
settingsRadius.addEventListener('input', () => {
  radiusRange.value = settingsRadius.value;
  document.querySelector('#radius-value').textContent = settingsRadius.value;
  document.querySelector('#settings-radius-value').textContent = settingsRadius.value;
  savePreferences();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRides, 120);
});
liveUpdatesToggle.addEventListener('change', () => {
  savePreferences();
  setLiveUpdates(liveUpdatesToggle.checked);
});
window.addEventListener('hashchange', showPage);

document.querySelector('#use-location').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(position => {
    setPosition(position.coords.latitude, position.coords.longitude, 'Your current location');
    document.querySelector('#map-caption').textContent = 'YOUR CURRENT LOCATION';
  }, () => {
    document.querySelector('#location-label').textContent = 'Location unavailable · MG Road, Bangalore';
  }, { enableHighAccuracy: true, timeout: 8000 });
});

offerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(offerForm);
  const payload = Object.fromEntries(formData.entries());
  const destinationOption = destinationSelect.selectedOptions[0];
  const destination = { lat: Number(destinationOption.dataset.lat), lng: Number(destinationOption.dataset.lng) };
  Object.assign(payload, {
    lat: currentPosition.lat,
    lng: currentPosition.lng,
    destLat: destination.lat,
    destLng: destination.lng,
    heading: bearingBetween(currentPosition, destination)
  });
  const submit = offerForm.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.firstChild.textContent = 'Posting…';
  try {
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not post your ride.');
    dialog.close();
    offerForm.reset();
    await loadRides();
  } catch (error) {
    document.querySelector('#form-note').textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.firstChild.textContent = 'Post my ride ';
  }
});

headingSelect.value = preferences.heading;
radiusRange.value = preferences.radiusKm;
liveUpdatesToggle.checked = preferences.liveUpdates;
document.querySelector('#radius-value').textContent = preferences.radiusKm;
settingsHeading.value = preferences.heading;
settingsRadius.value = preferences.radiusKm;
document.querySelector('#settings-radius-value').textContent = preferences.radiusKm;
setAuthMode('register');
updateAccountView();
initMap();
showPage();
setLiveUpdates(preferences.liveUpdates);
loadStatus();
loadRides();
loadCurrentUser();