const appState = {
  songs: [],
  setlists: [],
  activeSetlistId: null,
  activeSong: null,
  currentTransposedKey: null,
  fontSizeLevel: 0, // -2 to +4
  settings: {
    fontFamily: 'font-inter',
    chordColor: 'chord-gold',
    supabaseUrl: '',
    supabaseKey: ''
  }};

const DEFAULT_SONGS = [{
    id: 'song-1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    originalKey: 'G',
    content: `[Intro]\n[G] [C] [G] [D]\n\n[Verse 1]\n[G]Amazing grace, how [C]sweet the sound\nThat [G]saved a wretch like [D]me\nI [G]once was lost, but [C]now am found\nWas [G]blind, but [D]now I [G]see\n\n[Chorus]\n[G]Grace that will my [C]fears relieve\nAnd [G]grace my fears [D]relieved\nHow [G]precious did that [C]grace appear\nThe [G]hour I [D]first be[G]lieved`
  },{
    id: 'song-2',
    title: '10,000 Reasons',
    artist: 'Matt Redman',
    originalKey: 'C',
    content: `[Chorus]\nBless the [F]Lord, O my [C]soul, [G/B]O my [Am]soul\n[F]Worship His [C]holy [Gsus4]name [G]\nSing like [F]never be[Am]fore, [F]O my [C]soul\nI'll [F]worship Your [G]holy [C]name\n\n[Verse 1]\nThe [F]sun comes [C]up, it's a [G]new day [Am]dawning\n[F]It's time to [C]sing Your [G]song a[Am]gain\nWhat[F]ever may [C]pass and what[G]ever lies be[Am]fore me\n[F2]Let me be [C]singing when the [Gsus4]eve-[G]ning [C]comes`
  }];

document.addEventListener('DOMContentLoaded', () => {
  loadLocalStorage();
  populateKeyDropdowns();
  bindUIEvents();
  checkURLParams();
  requestWakeLock();
  initSetlistEvents();
  initSongLibraryEvents();
  initSwipeGestures();
  const btnPrev = document.getElementById('btnPrevSong');
  const btnNext = document.getElementById('btnNextSong');
  if (btnPrev) btnPrev.onclick = () => navigateSetlistSong(-1);
  if (btnNext) btnNext.onclick = () => navigateSetlistSong(1);
  renderAllViews();
});

function loadLocalStorage() {
  const savedSongs = localStorage.getItem('bandsync_songs');
  const savedSetlists = localStorage.getItem('bandsync_setlists');
  const savedSettings = localStorage.getItem('bandsync_settings');

  appState.songs = savedSongs ? JSON.parse(savedSongs) : DEFAULT_SONGS;
  appState.setlists = savedSetlists ? JSON.parse(savedSetlists) : [
    { id: 'setlist-1', name: 'Sunday Worship Setlist', songs: ['song-1', 'song-2'] }
  ];
  if (savedSettings) appState.settings = JSON.parse(savedSettings);}

function saveLocalStorage() {
  localStorage.setItem('bandsync_songs', JSON.stringify(appState.songs));
  localStorage.setItem('bandsync_setlists', JSON.stringify(appState.setlists));
  localStorage.setItem('bandsync_settings', JSON.stringify(appState.settings));
  if (typeof broadcastAppState === 'function') {
    broadcastAppState();}}

function populateKeyDropdowns() {
  const keys = window.Transposer.CHROMATIC_SCALE;
  const songKeySelect = document.getElementById('songKey');
  const transposeSelect = document.getElementById('transposeSelect');
  songKeySelect.innerHTML = '';
  transposeSelect.innerHTML = '<option value="">Original</option>';
  keys.forEach(k => {
    songKeySelect.innerHTML += `<option value="${k}">${k}</option>`;
    transposeSelect.innerHTML += `<option value="${k}">${k}</option>`;});}

function prepareCreateSongForm() {
  const editId = document.getElementById('editSongId');
  const title = document.getElementById('songTitle');
  const artist = document.getElementById('songArtist');
  const key = document.getElementById('songKey');
  const content = document.getElementById('songContent');
  const editorTitle = document.getElementById('editorTitle');
  if (editId) editId.value = '';
  if (title) title.value = '';
  if (artist) artist.value = '';
  if (key) key.value = 'C';
  if (content) content.value = '';
  if (editorTitle) editorTitle.textContent = '➕ Create New Song';
  document.getElementById('songForm').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('songTitle').focus();}

function loadSongIntoEditor(song) {
  document.getElementById('editSongId').value = song.id;
  document.getElementById('songTitle').value = song.title;
  document.getElementById('songArtist').value = song.artist || '';
  document.getElementById('songKey').value = song.originalKey || 'C';
  document.getElementById('songContent').value = song.content || '';
  document.getElementById('editorTitle').textContent = `✏️ Editing Song: ${song.title}`;
  document.getElementById('songForm').scrollIntoView({ behavior: 'smooth' });}

function initSongLibraryEvents() {
const btnNewSong = document.getElementById('btnNewSong');
  if (btnNewSong) {
    btnNewSong.onclick = () => {
      prepareCreateSongForm();
      const songForm = document.getElementById('songForm');
      if (songForm) songForm.scrollIntoView({ behavior: 'smooth' });};}
  const searchInput = document.getElementById('songSearch');
  if (searchInput) {
    searchInput.oninput = (e) => renderSongLibrary(e.target.value);}
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  if (btnCancelEdit) {
    btnCancelEdit.onclick = () => prepareCreateSongForm();}
  const songForm = document.getElementById('songForm');
  if (songForm) {
    songForm.onsubmit = (e) => {
      e.preventDefault();
      const existingId = document.getElementById('editSongId').value;
      const title = document.getElementById('songTitle').value.trim();
      const artist = document.getElementById('songArtist').value.trim();
      const originalKey = document.getElementById('songKey').value;
      const content = document.getElementById('songContent').value;
      if (!title) return;
      if (existingId) {
        const index = appState.songs.findIndex(s => s.id === existingId);
        if (index !== -1) {
          appState.songs[index] = { id: existingId, title, artist, originalKey, content };}
      } else {
        const newSong = {
          id: 'song-' + Date.now(),
          title,
          artist,
          originalKey,
          content};
        appState.songs.push(newSong);}
      saveLocalStorage();
      renderSongLibrary();
      prepareCreateSongForm();
      alert(`Song "${title}" saved successfully!`);};}}

function renderSongLibrary(filterQuery = '') {
  const list = document.getElementById('songLibraryItems');
  if (!list) return;
  list.innerHTML = '';
  const query = (filterQuery || '').toLowerCase().trim();
  const filtered = appState.songs.filter(song => {
    const title = (song.title || '').toLowerCase();
    const artist = (song.artist || '').toLowerCase();
    const key = (song.originalKey || '').toLowerCase();
    return title.includes(query) || artist.includes(query) || key.includes(query);});
  filtered.forEach(song => {
    const card = document.createElement('li');
    card.className = 'item-card';
    card.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; margin-bottom: 0.5rem;';
    card.innerHTML = `
      <div>
        <strong>${song.title}</strong>
        <div class="text-muted" style="font-size: 0.8rem;">${song.artist || 'Unknown'} • Key: ${song.originalKey || 'C'}</div>
      </div>
      <div style="display: flex; gap: 0.4rem;">
        <button type="button" class="btn btn-xs btn-outline btn-edit">Edit</button>
        <button type="button" class="btn btn-xs btn-outline btn-danger btn-delete-song">Delete</button>
        <button type="button" class="btn btn-xs btn-primary btn-play">Play</button>
      </div>`;
    card.querySelector('.btn-edit').onclick = (e) => {
      e.stopPropagation();
      document.getElementById('editSongId').value = song.id;
      document.getElementById('songTitle').value = song.title || '';
      document.getElementById('songArtist').value = song.artist || '';
      document.getElementById('songKey').value = song.originalKey || 'C';
      document.getElementById('songContent').value = song.content || '';
      const editorTitle = document.getElementById('editorTitle');
      if (editorTitle) editorTitle.textContent = `✏️ Editing: ${song.title}`;
      const songForm = document.getElementById('songForm');
      if (songForm) songForm.scrollIntoView({ behavior: 'smooth' });};
    card.querySelector('.btn-delete-song').onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${song.title}" from library?`)) {
        appState.songs = appState.songs.filter(s => s.id !== song.id);
        appState.setlists.forEach(setlist => {
          setlist.songs = setlist.songs.filter(id => id !== song.id);});
        saveLocalStorage();
        renderSongLibrary(filterQuery);
        renderSetlists();
        if (typeof broadcastAppState === 'function') broadcastAppState();}};
    card.querySelector('.btn-play').onclick = (e) => {
      e.stopPropagation();
      appState.activeSong = song;
      renderChordSheet(song);
      document.querySelector('[data-tab="tabPerformance"]').click();};
    list.appendChild(card);});}

function navigateSetlistSong(direction) {
  const currentSetlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
  let songList = [];
  if (currentSetlist && currentSetlist.songs.length > 0) {
    songList = currentSetlist.songs.map(id => appState.songs.find(s => s.id === id)).filter(Boolean);
  } else {
    songList = appState.songs;}
  if (!songList.length || !appState.activeSong) return;
  const currentIndex = songList.findIndex(s => s.id === appState.activeSong.id);
  let newIndex = currentIndex + direction;
  if (newIndex >= 0 && newIndex < songList.length) {
    appState.activeSong = songList[newIndex];
    renderChordSheet(appState.activeSong);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.syncEngine) {
      window.syncEngine.broadcast('SET_SONG', { songId: appState.activeSong.id, key: appState.activeSong.originalKey });}}}

function initSetlistEvents() {
  const btnCreateSetlist = document.getElementById('btnCreateSetlist');
  if (btnCreateSetlist) {
    btnCreateSetlist.onclick = () => {
      const name = prompt('Enter New Setlist Name:', 'Sunday Service');
      if (name && name.trim()) {
        const newSetlist = {
          id: 'setlist-' + Date.now(),
          name: name.trim(),
          songs: []
        };
        appState.setlists.push(newSetlist);
        appState.activeSetlistId = newSetlist.id;
        saveLocalStorage();
        renderSetlists();
        selectSetlist(newSetlist);}};}
  const searchInput = document.getElementById('songSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderSongLibrary(e.target.value);});}
  const btnDeleteSong = document.getElementById('btnDeleteSong');
  if (btnDeleteSong) {
    btnDeleteSong.onclick = () => {
      const id = document.getElementById('editSongId').value;
      if (id && confirm('Are you sure you want to permanently delete this song?')) {
        appState.songs = appState.songs.filter(s => s.id !== id);
        appState.setlists.forEach(setlist => {
          setlist.songs = setlist.songs.filter(sId => sId !== id);});
        saveLocalStorage();
        renderSongLibrary();
        prepareCreateSongForm();
        renderSetlists();}};}
  const btnDeleteSetlist = document.getElementById('btnDeleteSetlist');
  if (btnDeleteSetlist) {
    btnDeleteSetlist.onclick = () => {
      if (!appState.activeSetlistId) return;
      const setlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
      if (setlist && confirm(`Delete setlist "${setlist.name}"?`)) {
        appState.setlists = appState.setlists.filter(s => s.id !== appState.activeSetlistId);
        appState.activeSetlistId = appState.setlists.length ? appState.setlists[0].id : null;
        saveLocalStorage();
        renderSetlists();
        if (appState.activeSetlistId) {
          selectSetlist(appState.setlists[0]);
        } else {
          document.getElementById('setlistDetailContent').classList.add('hidden');
          document.getElementById('setlistDetailEmpty').classList.remove('hidden');
        }}};}
  const btnAddSongToSetlist = document.getElementById('btnAddSongToSetlist');
  if (btnAddSongToSetlist) {
    btnAddSongToSetlist.onclick = () => {
      if (!appState.activeSetlistId) {
        alert('Please select or create a setlist first.');
        return;}
      renderAddSongPickerList();
      document.getElementById('modalAddSongToSetlist').classList.remove('hidden');};}}

function renderAddSongPickerList() {
  const container = document.getElementById('addSongPickerList');
  if (!container) return;
  container.innerHTML = '';
  const setlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
  if (!setlist) return;
  appState.songs.forEach(song => {
    const isAdded = setlist.songs.includes(song.id);
    const item = document.createElement('li');
    item.className = 'item-card';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '0.6rem';
    item.style.marginBottom = '0.4rem';
    item.innerHTML = `
      <div>
        <strong>${song.title}</strong>
        <span class="text-muted" style="font-size:0.8rem;">(${song.originalKey})</span>
      </div>
      <button class="btn btn-xs ${isAdded ? 'btn-danger' : 'btn-success'}">
        ${isAdded ? '✕ Remove' : '+ Add'}
      </button>`;
    item.querySelector('button').onclick = () => {
      if (isAdded) {
        setlist.songs = setlist.songs.filter(id => id !== song.id);
      } else {
        setlist.songs.push(song.id);}
      saveLocalStorage();
      renderSetlistSongList(setlist);
      renderSetlists();
      renderAddSongPickerList();};
    container.appendChild(item);});}

function renderSetlistSongList(setlist) {
  const list = document.getElementById('setlistSongList');
  if (!list) return;
  list.innerHTML = '';
  if (setlist.songs.length === 0) {
    list.innerHTML = '<li class="text-muted text-center py-1">No songs in this setlist yet.</li>';
    return;}
  setlist.songs.forEach((songId, index) => {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;
    const li = document.createElement('li');
    li.className = 'item-card';
    li.draggable = true;
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '0.75rem';
    li.style.marginBottom = '0.5rem';
    li.style.cursor = 'grab';
    li.dataset.id = song.id;
    li.innerHTML = `
      <div style="display:flex; align-items:center; gap: 10px;">
        <span class="text-muted" style="font-size:1.2rem; cursor:grab;">☰</span>
        <div>
          <strong>${song.title}</strong>
          <div class="text-muted" style="font-size:0.8rem;">Key: ${song.originalKey}</div>
        </div>
      </div>
      <button class="btn btn-xs btn-outline btn-danger btn-remove-song">✕</button>`;
    li.querySelector('.btn-remove-song').onclick = (e) => {
      e.stopPropagation();
      setlist.songs.splice(index, 1);
      saveLocalStorage();
      renderSetlistSongList(setlist);
      renderSetlists();};
    li.onclick = () => {
      appState.activeSong = song;
      renderChordSheet(song);
      document.querySelector('[data-tab="tabPerformance"]').click();};
    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      li.style.opacity = '0.5';});
    li.addEventListener('dragend', (e) => {
      li.classList.remove('dragging');
      li.style.opacity = '1';
      
      const newOrderIds = [...list.querySelectorAll('.item-card')].map(item => item.dataset.id);
      setlist.songs = newOrderIds;
      saveLocalStorage();
      renderSetlistSongList(setlist);});
    list.appendChild(li);});

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingEl = document.querySelector('.dragging');
    if (!draggingEl) return;
    const siblings = [...list.querySelectorAll('.item-card:not(.dragging)')];
    const nextSibling = siblings.find(sibling => {
      return e.clientY <= sibling.getBoundingClientRect().top + sibling.offsetHeight / 2;
    });
    if (nextSibling) {
      list.insertBefore(draggingEl, nextSibling);
    } else {
      list.appendChild(draggingEl);}});}

function initSwipeGestures() {
  const perfContainer = document.getElementById('tabPerformance');
  if (!perfContainer) return;
  let touchStartX = 0;
  let touchStartY = 0;
  perfContainer.addEventListener('touchstart', (e) => {
    if (e.target.closest('.performance-toolbar')) {
      touchStartX = 0; // Reset
      return;}
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  perfContainer.addEventListener('touchend', (e) => {
    if (e.target.closest('.performance-toolbar') || touchStartX === 0) return;
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50) {
      if (deltaX < 0) {
        navigateSetlistSong(1);
      } else {
        navigateSetlistSong(-1);}}
    touchStartX = 0; // Reset for next swipe
  }, { passive: true });}

function renderChordSheet(song, targetKey) {
  const displayContainer = document.getElementById('perfChordSheet');
  const navPillsContainer = document.getElementById('sectionNavPills');
  document.getElementById('perfSongTitle').textContent = song.title;
  document.getElementById('perfSongArtist').textContent = song.artist || 'Unknown Artist';
  const originalKey = song.originalKey || 'C';
  const effectiveKey = targetKey || originalKey;
  document.getElementById('perfCurrentKey').textContent = effectiveKey;
  const semitones = window.Transposer.getSemitoneDistance(originalKey, effectiveKey);
  const transposedContent = window.Transposer.transposeBracketedContent(song.content, semitones);
  displayContainer.innerHTML = '';
  navPillsContainer.innerHTML = '';
  const lines = transposedContent.split('\n');
  let currentSectionEl = null;
  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.slice(1,-1).includes('[')) {
      const sectionTitle = trimmed.slice(1, -1);
      const sectionId = `section-${sectionTitle.toLowerCase().replace(/\s+/g, '-')}`;
      currentSectionEl = document.createElement('div');
      currentSectionEl.className = 'song-section-block';
      currentSectionEl.id = sectionId;
      const titleEl = document.createElement('div');
      titleEl.className = 'section-title';
      titleEl.textContent = sectionTitle;
      currentSectionEl.appendChild(titleEl);
      displayContainer.appendChild(currentSectionEl);
      const pill = document.createElement('button');
      pill.className = 'section-pill';
      pill.textContent = sectionTitle;
      pill.onclick = () => jumpToSection(sectionId);
      navPillsContainer.appendChild(pill);
      return;}
      
    if (!currentSectionEl) {
      currentSectionEl = document.createElement('div');
      currentSectionEl.className = 'song-section-block';
      displayContainer.appendChild(currentSectionEl);}
    if (trimmed.length > 0) {
      const lineEl = document.createElement('div');
      lineEl.className = 'chord-line';
      const tokens = line.split(/(\[[^\]]+\])/g);
      let currentChord = '';
      tokens.forEach(token => {
        if (token.startsWith('[') && token.endsWith(']')) {
          currentChord = token.slice(1, -1);
        } else {
          const tokenEl = document.createElement('span');
          tokenEl.className = 'chord-token';
          tokenEl.innerHTML = `
            <span class="chord">${currentChord}</span>
            <span class="lyric">${token || ' '}</span>
          `;
          lineEl.appendChild(tokenEl);
          currentChord = '';
        }});
      currentSectionEl.appendChild(lineEl);
    }});}

function jumpToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.song-section-block').forEach(b => b.classList.remove('section-highlight'));
    el.classList.add('section-highlight');
    window.syncEngine.broadcast('JUMP_SECTION', { sectionId });}}

function bindUIEvents() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');});});
  document.getElementById('songForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('editSongId').value || `song-${Date.now()}`;
    const newSong = {
      id,
      title: document.getElementById('songTitle').value,
      artist: document.getElementById('songArtist').value,
      originalKey: document.getElementById('songKey').value,
      content: document.getElementById('songContent').value
    };
    const existingIdx = appState.songs.findIndex(s => s.id === id);
    if (existingIdx >= 0) {
      appState.songs[existingIdx] = newSong;
    } else {
      appState.songs.push(newSong);}
    saveLocalStorage();
    renderAllViews();
    alert('Song saved successfully!');});
  document.getElementById('transposeSelect').addEventListener('change', (e) => {
    appState.currentTransposedKey = e.target.value;
    if (appState.activeSong) {
      renderChordSheet(appState.activeSong, appState.currentTransposedKey);
      window.syncEngine.broadcast('TRANSPOSE', { key: appState.currentTransposedKey });
    }});
  document.getElementById('btnFontLarger').addEventListener('click', () => adjustFontSize(0.1));
  document.getElementById('btnFontSmaller').addEventListener('click', () => adjustFontSize(-0.1));
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();}});
  document.getElementById('btnHostSession').addEventListener('click', startHostSession);
  document.getElementById('btnJoinSession').addEventListener('click', () => {
    document.getElementById('modalJoin').classList.remove('hidden');});
  document.getElementById('btnConfirmJoin').addEventListener('click', () => {
    const code = document.getElementById('inputSessionCode').value.trim();
    if (code) joinSessionByCode(code);});
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).classList.add('hidden');});});}

function adjustFontSize(delta) {
  const root = document.documentElement;
  const currentChord = parseFloat(getComputedStyle(root).getPropertyValue('--font-size-chord')) || 1.1;
  const currentLyric = parseFloat(getComputedStyle(root).getPropertyValue('--font-size-lyric')) || 1.05;
  root.style.setProperty('--font-size-chord', `${currentChord + delta}rem`);
  root.style.setProperty('--font-size-lyric', `${currentLyric + delta}rem`);}

function startHostSession() {
  const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  window.syncEngine.initHost(sessionCode, {
    onHostReady: (code) => {
      document.getElementById('displaySessionCode').textContent = code;
      window.syncEngine.generateQRCode('qrcode', code);
      document.getElementById('modalHost').classList.remove('hidden');
      updateSyncBadge('Host', 'status-host');
      if (typeof broadcastAppState === 'function') broadcastAppState();},
    onPeerCountChange: (count) => {
      document.getElementById('hostPeerCount').textContent = count;
      document.getElementById('peerCount').textContent = count;
      document.getElementById('peerCountBadge').classList.toggle('hidden', count === 0);
      if (count > 0 && typeof broadcastAppState === 'function') {
        broadcastAppState();}}});}

function joinSessionByCode(code) {
  window.syncEngine.joinSession(code, {
    onConnected: () => {
      document.getElementById('modalJoin').classList.add('hidden');
      updateSyncBadge('Connected', 'status-online');
      alert(`Connected to Band Session: ${code}`);
      if (window.syncEngine && typeof window.syncEngine.broadcast === 'function') {
        window.syncEngine.broadcast('REQUEST_SYNC', {});}},
    onStateReceived: (packet) => {
      handleRemoteStateUpdate(packet);},
    onDisconnected: () => {
      updateSyncBadge('Disconnected', 'status-offline');}});}

function handleRemoteStateUpdate(packet) {
  const { type, payload } = packet;
  if (type === 'SYNC_STATE') {
    if (payload.songs) appState.songs = payload.songs;
    if (payload.setlists) appState.setlists = payload.setlists;
    if (payload.activeSetlistId) appState.activeSetlistId = payload.activeSetlistId;
    saveLocalStorage();
    renderSongLibrary();
    renderSetlists();
    if (payload.activeSongId) {
      const song = appState.songs.find(s => s.id === payload.activeSongId);
      if (song) {
        appState.activeSong = song;
        if (typeof renderChordSheet === 'function') renderChordSheet(song, appState.currentTransposedKey);}}
    return;}
  if (type === 'SET_SONG') {
    const song = appState.songs.find(s => s.id === payload.songId);
    if (song) {
      appState.activeSong = song;
      appState.currentTransposedKey = payload.key || song.originalKey;
      renderChordSheet(song, appState.currentTransposedKey);
    } else {
      // If remote device lacks the custom song, ask host to sync the database
      if (window.syncEngine && typeof window.syncEngine.broadcast === 'function') {
        window.syncEngine.broadcast('REQUEST_SYNC', {});}}
  } else if (type === 'JUMP_SECTION') {
    if (typeof jumpToSection === 'function') jumpToSection(payload.sectionId);
  } else if (type === 'TRANSPOSE') {
    appState.currentTransposedKey = payload.key;
    if (appState.activeSong && typeof renderChordSheet === 'function') {
      renderChordSheet(appState.activeSong, appState.currentTransposedKey);}
  } else if (type === 'REQUEST_SYNC') {
    if (typeof broadcastAppState === 'function') broadcastAppState();}}

function updateSyncBadge(text, className) {
  const badge = document.getElementById('syncBadge');
  document.getElementById('syncStatusText').textContent = text;
  badge.className = `sync-badge ${className}`;}

function checkURLParams() {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    joinSessionByCode(joinCode);}}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock activated for performance.');}
  } catch (err) {
    console.log('Wake Lock Error:', err);}}

function renderAllViews() {
  renderSongLibrary();
  renderSetlists();
  if (appState.songs.length > 0 && !appState.activeSong) {
    appState.activeSong = appState.songs[0];
    renderChordSheet(appState.activeSong);}}
    
// ==========================================
// UNIFIED SYNC & BROADCAST ENGINE
// ==========================================

function handleRemoteStateUpdate(packet) {
  if (!packet) return;
  const type = packet.type;
  const payload = packet.payload || packet;
  if (type === 'SYNC_STATE') {
    if (payload.songs && Array.isArray(payload.songs) && payload.songs.length > 0) {
      appState.songs = payload.songs;}
    if (payload.setlists && Array.isArray(payload.setlists)) {
      appState.setlists = payload.setlists;}
    if (payload.activeSetlistId !== undefined) {
      appState.activeSetlistId = payload.activeSetlistId;}
    localStorage.setItem('bandsync_songs', JSON.stringify(appState.songs));
    localStorage.setItem('bandsync_setlists', JSON.stringify(appState.setlists));
    renderSongLibrary();
    renderSetlists();
    if (appState.activeSetlistId) {
      const activeSetlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
      if (activeSetlist && typeof renderSetlistSongList === 'function') {
        renderSetlistSongList(activeSetlist);}}
    if (payload.activeSongId) {
      const song = appState.songs.find(s => s.id === payload.activeSongId);
      if (song) {
        appState.activeSong = song;
        if (typeof renderChordSheet === 'function') {
          renderChordSheet(song, appState.currentTransposedKey);}}}
  } else if (type === 'SET_SONG') {
    const songId = payload.songId || payload;
    const song = appState.songs.find(s => s.id === songId);
    if (song) {
      appState.activeSong = song;
      appState.currentTransposedKey = payload.key || song.originalKey;
      if (typeof renderChordSheet === 'function') renderChordSheet(song, appState.currentTransposedKey);
    } else {
      if (window.syncEngine && typeof window.syncEngine.broadcast === 'function') {
        window.syncEngine.broadcast('REQUEST_SYNC', {});}}
  } else if (type === 'JUMP_SECTION') {
    if (typeof jumpToSection === 'function') jumpToSection(payload.sectionId);
  } else if (type === 'TRANSPOSE') {
    appState.currentTransposedKey = payload.key;
    if (appState.activeSong && typeof renderChordSheet === 'function') {
      renderChordSheet(appState.activeSong, appState.currentTransposedKey);}
  } else if (type === 'REQUEST_SYNC') {
    if (typeof broadcastAppState === 'function') broadcastAppState();}}

function broadcastAppState() {
  const payload = {
    songs: appState.songs,
    setlists: appState.setlists,
    activeSetlistId: appState.activeSetlistId,
    activeSongId: appState.activeSong ? appState.activeSong.id : null};
  if (typeof syncChannel !== 'undefined' && syncChannel) {
    syncChannel.postMessage({ type: 'SYNC_STATE', payload: payload });}
  if (window.syncEngine && typeof window.syncEngine.broadcast === 'function') {
    window.syncEngine.broadcast('SYNC_STATE', payload);}}

// ==========================================
// MISSING SETLIST UI FUNCTIONS (FIX)
// ==========================================
function renderSetlists() {
  const list = document.getElementById('setlistItems');
  if (!list) return;
  list.innerHTML = '';
  
  appState.setlists.forEach(setlist => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.style.cursor = 'pointer';
    li.style.marginBottom = '0.5rem';
    
    // Highlight the active setlist (Dark-mode friendly tint instead of solid white)
    if (setlist.id === appState.activeSetlistId) {
      li.style.borderLeft = '4px solid #0d6efd';
      li.style.backgroundColor = 'rgba(13, 110, 253, 0.15)'; 
    }
    
    li.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <strong>${setlist.name}</strong>
        <span class="text-muted" style="font-size: 0.85rem;">${setlist.songs.length} songs</span>
      </div>
    `;
    
    li.onclick = () => selectSetlist(setlist.id);
    list.appendChild(li);
  });
}

function selectSetlist(id) {
  appState.activeSetlistId = id;
  
  // This saves to local storage and triggers the broadcast to all connected members
  saveLocalStorage(); 
  renderSetlists();
  
  const setlistDetailContent = document.getElementById('setlistDetailContent');
  const setlistDetailEmpty = document.getElementById('setlistDetailEmpty');
  
  if (id) {
    const setlist = appState.setlists.find(s => s.id === id);
    if (setlist) {
      if (setlistDetailContent) setlistDetailContent.classList.remove('hidden');
      if (setlistDetailEmpty) setlistDetailEmpty.classList.add('hidden');
      if (typeof renderSetlistSongList === 'function') {
        renderSetlistSongList(setlist);
      }
    }
  } else {
    if (setlistDetailContent) setlistDetailContent.classList.add('hidden');
    if (setlistDetailEmpty) setlistDetailEmpty.classList.remove('hidden');
  }
}
