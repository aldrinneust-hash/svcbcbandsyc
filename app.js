/**
 * BandSync Main Application Logic
 * State management, song parsing, navigation, setlists, and UI event handlers.
 */

// Global State
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
  }
};

// Initial Seed Data
const DEFAULT_SONGS = [
  {
    id: 'song-1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    originalKey: 'G',
    content: `[Intro]\n[G] [C] [G] [D]\n\n[Verse 1]\n[G]Amazing grace, how [C]sweet the sound\nThat [G]saved a wretch like [D]me\nI [G]once was lost, but [C]now am found\nWas [G]blind, but [D]now I [G]see\n\n[Chorus]\n[G]Grace that will my [C]fears relieve\nAnd [G]grace my fears [D]relieved\nHow [G]precious did that [C]grace appear\nThe [G]hour I [D]first be[G]lieved`
  },
  {
    id: 'song-2',
    title: '10,000 Reasons',
    artist: 'Matt Redman',
    originalKey: 'C',
    content: `[Chorus]\nBless the [F]Lord, O my [C]soul, [G/B]O my [Am]soul\n[F]Worship His [C]holy [Gsus4]name [G]\nSing like [F]never be[Am]fore, [F]O my [C]soul\nI'll [F]worship Your [G]holy [C]name\n\n[Verse 1]\nThe [F]sun comes [C]up, it's a [G]new day [Am]dawning\n[F]It's time to [C]sing Your [G]song a[Am]gain\nWhat[F]ever may [C]pass and what[G]ever lies be[Am]fore me\n[F2]Let me be [C]singing when the [Gsus4]eve-[G]ning [C]comes`
  }
];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadLocalStorage();
  populateKeyDropdowns();
  bindUIEvents();
  checkURLParams();
  requestWakeLock();
  // Initialize updated feature event handlers
  initSetlistEvents();
  initSongLibraryEvents();
  initSwipeGestures();
  
  // Prev/Next Button Actions
  const btnPrev = document.getElementById('btnPrevSong');
  const btnNext = document.getElementById('btnNextSong');
  if (btnPrev) btnPrev.onclick = () => navigateSetlistSong(-1);
  if (btnNext) btnNext.onclick = () => navigateSetlistSong(1);

  renderAllViews();
});

/* Local Storage Persistence */
function loadLocalStorage() {
  const savedSongs = localStorage.getItem('bandsync_songs');
  const savedSetlists = localStorage.getItem('bandsync_setlists');
  const savedSettings = localStorage.getItem('bandsync_settings');

  appState.songs = savedSongs ? JSON.parse(savedSongs) : DEFAULT_SONGS;
  appState.setlists = savedSetlists ? JSON.parse(savedSetlists) : [
    { id: 'setlist-1', name: 'Sunday Worship Setlist', songs: ['song-1', 'song-2'] }
  ];
  if (savedSettings) appState.settings = JSON.parse(savedSettings);
}

function saveLocalStorage() {
  localStorage.setItem('bandsync_songs', JSON.stringify(appState.songs));
  localStorage.setItem('bandsync_setlists', JSON.stringify(appState.setlists));
  localStorage.setItem('bandsync_settings', JSON.stringify(appState.settings));
  // ADD THIS LINE: Broadcast changes to all synced devices immediately
  if (typeof broadcastAppState === 'function') {
    broadcastAppState();
  }
}

/* Populate Key Dropdowns */
function populateKeyDropdowns() {
  const keys = window.Transposer.CHROMATIC_SCALE;
  const songKeySelect = document.getElementById('songKey');
  const transposeSelect = document.getElementById('transposeSelect');

  songKeySelect.innerHTML = '';
  transposeSelect.innerHTML = '<option value="">Original</option>';

  keys.forEach(k => {
    songKeySelect.innerHTML += `<option value="${k}">${k}</option>`;
    transposeSelect.innerHTML += `<option value="${k}">${k}</option>`;
  });
}

// Clear Form for New Song Creation
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
  
  // Scroll directly to the form
  document.getElementById('songForm').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('songTitle').focus();
}

// Load Selected Song into Form for Editing
function loadSongIntoEditor(song) {
  document.getElementById('editSongId').value = song.id;
  document.getElementById('songTitle').value = song.title;
  document.getElementById('songArtist').value = song.artist || '';
  document.getElementById('songKey').value = song.originalKey || 'C';
  document.getElementById('songContent').value = song.content || '';
  
  document.getElementById('editorTitle').textContent = `✏️ Editing Song: ${song.title}`;
  
  // Scroll directly to the form
  document.getElementById('songForm').scrollIntoView({ behavior: 'smooth' });
}

// Attach Song Library & Editor Event Handlers
function initSongLibraryEvents() {
  // + Create Song Button
const btnNewSong = document.getElementById('btnNewSong');
  if (btnNewSong) {
    btnNewSong.onclick = () => {
      prepareCreateSongForm();
      const songForm = document.getElementById('songForm');
      if (songForm) songForm.scrollIntoView({ behavior: 'smooth' });
    };
  }
  
  const searchInput = document.getElementById('songSearch');
  if (searchInput) {
    searchInput.oninput = (e) => renderSongLibrary(e.target.value);
  }

  // Cancel Button
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  if (btnCancelEdit) {
    btnCancelEdit.onclick = () => prepareCreateSongForm();
  }

  // Song Form Save Handler (Handles BOTH Create and Update)
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
        // EDIT EXISTING SONG
        const index = appState.songs.findIndex(s => s.id === existingId);
        if (index !== -1) {
          appState.songs[index] = { id: existingId, title, artist, originalKey, content };
        }
      } else {
        // CREATE NEW SONG
        const newSong = {
          id: 'song-' + Date.now(),
          title,
          artist,
          originalKey,
          content
        };
        appState.songs.push(newSong);
      }

      saveLocalStorage();
      renderSongLibrary();
      prepareCreateSongForm();
      alert(`Song "${title}" saved successfully!`);
    };
  }
}

// Render Song Library Items with Working Edit Click
function renderSongLibrary(filterQuery = '') {
  const list = document.getElementById('songLibraryItems');
  if (!list) return;
  list.innerHTML = '';

  const query = (filterQuery || '').toLowerCase().trim();
  const filtered = appState.songs.filter(song => {
    const title = (song.title || '').toLowerCase();
    const artist = (song.artist || '').toLowerCase();
    const key = (song.originalKey || '').toLowerCase();
    return title.includes(query) || artist.includes(query) || key.includes(query);
  });

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
        <button type="button" class="btn btn-xs btn-outline btn-danger btn-delete">Delete</button>
        <button type="button" class="btn btn-xs btn-primary btn-play">Play</button>
      </div>
    `;

// 1. EDIT BUTTON FIX
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
      if (songForm) songForm.scrollIntoView({ behavior: 'smooth' });
    };

    // 2. DELETE BUTTON FIX
    card.querySelector('.btn-delete-song').onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${song.title}" from library?`)) {
        // Remove from main song array
        appState.songs = appState.songs.filter(s => s.id !== song.id);
        
        // Remove from all setlists
        appState.setlists.forEach(setlist => {
          setlist.songs = setlist.songs.filter(id => id !== song.id);
        });

        saveLocalStorage();
        renderSongLibrary(filterQuery);
        renderSetlists();
        
        // Broadcast change to synced devices
        if (typeof broadcastAppState === 'function') broadcastAppState();
      }
    };

    // Play Button Click
    card.querySelector('.btn-play').onclick = (e) => {
      e.stopPropagation();
      appState.activeSong = song;
      renderChordSheet(song);
      document.querySelector('[data-tab="tabPerformance"]').click();
    };

    list.appendChild(card);
  });
}

// Function to Navigate to Next / Previous Song in Active Setlist or Library
function navigateSetlistSong(direction) {
  const currentSetlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
  let songList = [];

  if (currentSetlist && currentSetlist.songs.length > 0) {
    songList = currentSetlist.songs.map(id => appState.songs.find(s => s.id === id)).filter(Boolean);
  } else {
    songList = appState.songs;
  }

  if (!songList.length || !appState.activeSong) return;

  const currentIndex = songList.findIndex(s => s.id === appState.activeSong.id);
  let newIndex = currentIndex + direction;

  if (newIndex >= 0 && newIndex < songList.length) {
    appState.activeSong = songList[newIndex];
    renderChordSheet(appState.activeSong);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.syncEngine) {
      window.syncEngine.broadcast('SET_SONG', { songId: appState.activeSong.id, key: appState.activeSong.originalKey });
    }
  }
}

// Bind Setlist Button Actions
function initSetlistEvents() {
  // 1. + NEW SETLIST BUTTON
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
        selectSetlist(newSetlist);
      }
    };
  }

// Search Bar Filter
  const searchInput = document.getElementById('songSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderSongLibrary(e.target.value);
    });
  }
  
// DELETE Song Button (in Editor)
  const btnDeleteSong = document.getElementById('btnDeleteSong');
  if (btnDeleteSong) {
    btnDeleteSong.onclick = () => {
      const id = document.getElementById('editSongId').value;
      if (id && confirm('Are you sure you want to permanently delete this song?')) {
        // Remove from songs list
        appState.songs = appState.songs.filter(s => s.id !== id);
        // Remove from all setlists
        appState.setlists.forEach(setlist => {
          setlist.songs = setlist.songs.filter(sId => sId !== id);
        });
        saveLocalStorage();
        renderSongLibrary();
        prepareCreateSongForm(); // Clear the form
        renderSetlists(); // Update setlists UI
      }
    };
  }

  // 2. DELETE SETLIST BUTTON
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
        }
      }
    };
  }

  // 3. + ADD SONGS BUTTON (Opens Modal Picker)
  const btnAddSongToSetlist = document.getElementById('btnAddSongToSetlist');
  if (btnAddSongToSetlist) {
    btnAddSongToSetlist.onclick = () => {
      if (!appState.activeSetlistId) {
        alert('Please select or create a setlist first.');
        return;
      }
      renderAddSongPickerList();
      document.getElementById('modalAddSongToSetlist').classList.remove('hidden');
    };
  }
}

// Replace these functions in app.js
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
      </button>
    `;

    item.querySelector('button').onclick = () => {
      if (isAdded) {
        setlist.songs = setlist.songs.filter(id => id !== song.id);
      } else {
        setlist.songs.push(song.id);
      }
      saveLocalStorage();
      // Update UI Immediately without reloading!
      renderSetlistSongList(setlist);
      renderSetlists();
      renderAddSongPickerList();
    };

    container.appendChild(item);
  });
}

function renderSetlistSongList(setlist) {
  const list = document.getElementById('setlistSongList');
  if (!list) return;
  list.innerHTML = '';

  if (setlist.songs.length === 0) {
    list.innerHTML = '<li class="text-muted text-center py-1">No songs in this setlist yet.</li>';
    return;
  }

  setlist.songs.forEach((songId, index) => {
    const song = appState.songs.find(s => s.id === songId);
    if (!song) return;

    const li = document.createElement('li');
    li.className = 'item-card';
    li.draggable = true; // Enables long-press Drag and Drop on Android
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
      <button class="btn btn-xs btn-outline btn-danger btn-remove-song">✕</button>
    `;

    // Separate Remove from Setlist (Does NOT delete Setlist, just removes song)
    li.querySelector('.btn-remove-song').onclick = (e) => {
      e.stopPropagation();
      setlist.songs.splice(index, 1);
      saveLocalStorage();
      renderSetlistSongList(setlist); // Update immediately
      renderSetlists();
    };

    li.onclick = () => {
      appState.activeSong = song;
      renderChordSheet(song);
      document.querySelector('[data-tab="tabPerformance"]').click();
    };

    // --- Drag and Drop Logic for Smooth Reordering ---
    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      li.style.opacity = '0.5';
    });

    li.addEventListener('dragend', (e) => {
      li.classList.remove('dragging');
      li.style.opacity = '1';
      
      // Save new arrangement
      const newOrderIds = [...list.querySelectorAll('.item-card')].map(item => item.dataset.id);
      setlist.songs = newOrderIds;
      saveLocalStorage();
      renderSetlistSongList(setlist); // snap cleanly
    });

    list.appendChild(li);
  });

  // Handle Drag Over to swap positions
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
      list.appendChild(draggingEl);
    }
  });
}

// Attach Touch Swipe Events for Mobile
// Replace ONLY the initSwipeGestures function in app.js
function initSwipeGestures() {
  const perfContainer = document.getElementById('tabPerformance');
  if (!perfContainer) return;
  
  let touchStartX = 0;
  let touchStartY = 0;

  perfContainer.addEventListener('touchstart', (e) => {
    // PREVENT SWIPE IF TOUCHING THE TOOLBAR
    if (e.target.closest('.performance-toolbar')) {
      touchStartX = 0; // Reset
      return;
    }
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  perfContainer.addEventListener('touchend', (e) => {
    // IGNORE IF TOUCHING THE TOOLBAR OR IF START WAS CANCELLED
    if (e.target.closest('.performance-toolbar') || touchStartX === 0) return;

    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Ensure it's a horizontal swipe
    if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50) {
      if (deltaX < 0) {
        navigateSetlistSong(1); // Swipe Left -> Next
      } else {
        navigateSetlistSong(-1); // Swipe Right -> Prev
      }
    }
    touchStartX = 0; // Reset for next swipe
  }, { passive: true });
}

/* Bracket Chord Sheet Parser & Renderer */
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

    // Detect Section Header e.g. [Chorus], [Verse 1]
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.slice(1,-1).includes('[')) {
      const sectionTitle = trimmed.slice(1, -1);
      const sectionId = `section-${sectionTitle.toLowerCase().replace(/\s+/g, '-')}`;

      // Section Block
      currentSectionEl = document.createElement('div');
      currentSectionEl.className = 'song-section-block';
      currentSectionEl.id = sectionId;

      const titleEl = document.createElement('div');
      titleEl.className = 'section-title';
      titleEl.textContent = sectionTitle;
      currentSectionEl.appendChild(titleEl);

      displayContainer.appendChild(currentSectionEl);

      // Section Navigation Pill
      const pill = document.createElement('button');
      pill.className = 'section-pill';
      pill.textContent = sectionTitle;
      pill.onclick = () => jumpToSection(sectionId);
      navPillsContainer.appendChild(pill);

      return;
    }

    if (!currentSectionEl) {
      currentSectionEl = document.createElement('div');
      currentSectionEl.className = 'song-section-block';
      displayContainer.appendChild(currentSectionEl);
    }

    // Parse Lyrics and Embedded Chords
    if (trimmed.length > 0) {
      const lineEl = document.createElement('div');
      lineEl.className = 'chord-line';

      // Regex matching [Chord]Lyrics
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
          currentChord = ''; // Reset after consumption
        }
      });

      currentSectionEl.appendChild(lineEl);
    }
  });
}

/* Navigation & Section Scroll */
function jumpToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.querySelectorAll('.song-section-block').forEach(b => b.classList.remove('section-highlight'));
    el.classList.add('section-highlight');

    // Broadcast if Host
    window.syncEngine.broadcast('JUMP_SECTION', { sectionId });
  }
}

/* UI Event Bindings */
function bindUIEvents() {
  // Tab Switching
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // Song Editor Form
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
      appState.songs.push(newSong);
    }

    saveLocalStorage();
    renderAllViews();
    alert('Song saved successfully!');
  });

  // Transpose Select Change
  document.getElementById('transposeSelect').addEventListener('change', (e) => {
    appState.currentTransposedKey = e.target.value;
    if (appState.activeSong) {
      renderChordSheet(appState.activeSong, appState.currentTransposedKey);
      window.syncEngine.broadcast('TRANSPOSE', { key: appState.currentTransposedKey });
    }
  });

  // Font Size Buttons
  document.getElementById('btnFontLarger').addEventListener('click', () => adjustFontSize(0.1));
  document.getElementById('btnFontSmaller').addEventListener('click', () => adjustFontSize(-0.1));

  // Fullscreen
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Host & Join Session Buttons
  document.getElementById('btnHostSession').addEventListener('click', startHostSession);
  document.getElementById('btnJoinSession').addEventListener('click', () => {
    document.getElementById('modalJoin').classList.remove('hidden');
  });

  document.getElementById('btnConfirmJoin').addEventListener('click', () => {
    const code = document.getElementById('inputSessionCode').value.trim();
    if (code) joinSessionByCode(code);
  });

  // Modal Close Handlers
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).classList.add('hidden');
    });
  });
}

/* Font Size Adjuster */
function adjustFontSize(delta) {
  const root = document.documentElement;
  const currentChord = parseFloat(getComputedStyle(root).getPropertyValue('--font-size-chord')) || 1.1;
  const currentLyric = parseFloat(getComputedStyle(root).getPropertyValue('--font-size-lyric')) || 1.05;

  root.style.setProperty('--font-size-chord', `${currentChord + delta}rem`);
  root.style.setProperty('--font-size-lyric', `${currentLyric + delta}rem`);
}

/* Host Session Logic */
function startHostSession() {
  const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  window.syncEngine.initHost(sessionCode, {
    onHostReady: (code) => {
      document.getElementById('displaySessionCode').textContent = code;
      window.syncEngine.generateQRCode('qrcode', code);
      document.getElementById('modalHost').classList.remove('hidden');
      
      updateSyncBadge('Host', 'status-host');
    },
    onPeerCountChange: (count) => {
      document.getElementById('hostPeerCount').textContent = count;
      document.getElementById('peerCount').textContent = count;
      document.getElementById('peerCountBadge').classList.toggle('hidden', count === 0);
    }
  });
}

/* Join Session Logic */
function joinSessionByCode(code) {
  window.syncEngine.joinSession(code, {
    onConnected: () => {
      document.getElementById('modalJoin').classList.add('hidden');
      updateSyncBadge('Connected', 'status-online');
      alert(`Connected to Band Session: ${code}`);
    },
    onStateReceived: (packet) => {
      handleRemoteStateUpdate(packet);
    },
    onDisconnected: () => {
      updateSyncBadge('Disconnected', 'status-offline');
    }
  });
}

/* Real-Time Payload Handler for Connected Members */
function handleRemoteStateUpdate(packet) {
  const { type, payload } = packet;

  if (type === 'SET_SONG') {
    const song = appState.songs.find(s => s.id === payload.songId);
    if (song) {
      appState.activeSong = song;
      appState.currentTransposedKey = payload.key || song.originalKey;
      renderChordSheet(song, appState.currentTransposedKey);
    }
  } else if (type === 'JUMP_SECTION') {
    jumpToSection(payload.sectionId);
  } else if (type === 'TRANSPOSE') {
    appState.currentTransposedKey = payload.key;
    if (appState.activeSong) {
      renderChordSheet(appState.activeSong, appState.currentTransposedKey);
    }
  }
}

function updateSyncBadge(text, className) {
  const badge = document.getElementById('syncBadge');
  document.getElementById('syncStatusText').textContent = text;
  badge.className = `sync-badge ${className}`;
}

/* URL Parameter Check for Direct QR Joins */
function checkURLParams() {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    joinSessionByCode(joinCode);
  }
}

/* Screen Wake Lock API for Stage Performance */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock activated for performance.');
    }
  } catch (err) {
    console.log('Wake Lock Error:', err);
  }
}

/* Render All Views */
function renderAllViews() {
  renderSongLibrary();
  renderSetlists();
  if (appState.songs.length > 0 && !appState.activeSong) {
    appState.activeSong = appState.songs[0];
    renderChordSheet(appState.activeSong);
  }
}

function renderSongLibrary() {
  const list = document.getElementById('songLibraryItems');
  list.innerHTML = '';
  appState.songs.forEach(song => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.innerHTML = `
      <div>
        <strong>${song.title}</strong>
        <div class="text-muted" style="font-size:0.8rem;">${song.artist || ''} • Key: ${song.originalKey}</div>
      </div>
      <button class="btn btn-xs btn-outline">Edit</button>
    `;
    li.onclick = () => {
      appState.activeSong = song;
      renderChordSheet(song);
      
      // Broadcast if Host
      window.syncEngine.broadcast('SET_SONG', { songId: song.id, key: song.originalKey });
    };
    list.appendChild(li);
  });
}

function renderSetlists() {
  const list = document.getElementById('setlistItems');
  list.innerHTML = '';
  appState.setlists.forEach(setlist => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.innerHTML = `<strong>${setlist.name}</strong> <span>(${setlist.songs.length} songs)</span>`;
    li.onclick = () => selectSetlist(setlist);
    list.appendChild(li);
  });
}

function selectSetlist(setlist) {
  appState.activeSetlistId = setlist.id;
  document.getElementById('setlistDetailContent').classList.remove('hidden');
  document.getElementById('setlistDetailEmpty').classList.add('hidden');
  document.getElementById('currentSetlistTitle').textContent = setlist.name;

  const songList = document.getElementById('setlistSongList');
  songList.innerHTML = '';

  setlist.songs.forEach(songId => {
    const song = appState.songs.find(s => s.id === songId);
    if (song) {
      const li = document.createElement('li');
      li.className = 'item-card';
      li.style.marginBottom = '0.4rem';
      li.innerHTML = `
        <div>
          <strong>${song.title}</strong> <span class="text-muted">(${song.originalKey})</span>
        </div>
        <button class="btn btn-xs btn-primary">Play</button>
      `;
      li.onclick = () => {
        appState.activeSong = song;
        renderChordSheet(song);
        document.querySelector('[data-tab="tabPerformance"]').click();
        
        // Broadcast
        window.syncEngine.broadcast('SET_SONG', { songId: song.id, key: song.originalKey });
      };
      songList.appendChild(li);
    }
  });
}

// Paste this at the very bottom of app.js
function handleIncomingSyncState(incomingState) {
  if (!incomingState) return;

  // 1. Sync Setlists
  if (incomingState.setlists) {
    appState.setlists = incomingState.setlists;
  }
  if (incomingState.activeSetlistId) {
    appState.activeSetlistId = incomingState.activeSetlistId;
  }

  // 2. Add missing custom songs from host into local storage
  if (incomingState.songs && Array.isArray(incomingState.songs)) {
    incomingState.songs.forEach(incomingSong => {
      const existingIndex = appState.songs.findIndex(s => s.id === incomingSong.id);
      if (existingIndex === -1) {
        appState.songs.push(incomingSong); // Add missing custom song
      } else {
        appState.songs[existingIndex] = incomingSong; // Update song details
      }
    });
  }

  // 3. Save to storage & update UI immediately
  saveLocalStorage();
  renderSetlists();
  renderSongLibrary();

  // 4. Update currently displayed performance song
  if (incomingState.activeSongId) {
    const songToPlay = appState.songs.find(s => s.id === incomingState.activeSongId);
    if (songToPlay) {
      appState.activeSong = songToPlay;
      renderChordSheet(songToPlay);
    }
  }
}

// ==========================================================
// BROADCAST CHANNEL SYNC SYSTEM (Pattern B)
// ==========================================================

// Replace at the bottom of app.js

// Broadcast current Host state (including all custom song definitions)
function handleIncomingSyncState(incomingState) {
  if (!incomingState) return;

  // FORCE OVERWRITE: Client devices must mirror the host exactly to see custom songs
  if (incomingState.songs && incomingState.songs.length > 0) {
    appState.songs = incomingState.songs;
  }
  if (incomingState.setlists && incomingState.setlists.length > 0) {
    appState.setlists = incomingState.setlists;
  }
  if (incomingState.activeSetlistId) {
    appState.activeSetlistId = incomingState.activeSetlistId;
  }

  // Save the mirrored data to the viewer's local storage
  saveLocalStorage();

  // Force the UI to immediately redraw with the host's custom songs
  renderSongLibrary();
  renderSetlists();
  
  const activeSetlist = appState.setlists.find(s => s.id === appState.activeSetlistId);
  if (activeSetlist && typeof renderSetlistSongList === 'function') {
    renderSetlistSongList(activeSetlist);
  }

  // Sync the current Live Performance screen
  if (incomingState.activeSongId) {
    const songToPlay = appState.songs.find(s => s.id === incomingState.activeSongId);
    if (songToPlay) {
      appState.activeSong = songToPlay;
      if (typeof renderChordSheet === 'function') renderChordSheet(songToPlay);
    }
  }
}
