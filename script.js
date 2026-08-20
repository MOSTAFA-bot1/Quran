const apiBase = 'https://api.alquran.cloud/v1';
const state = {
  surahs: [],
  selected: 1,
};

const surahListEl = document.getElementById('surahList');
const searchInput = document.getElementById('searchInput');
const surahBadge = document.getElementById('surahBadge');
const surahTitle = document.getElementById('surahTitle');
const surahMeta = document.getElementById('surahMeta');
const surahContent = document.getElementById('surahContent');
const loader = document.getElementById('loader');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const audioPlayer = document.getElementById('audioPlayer');
const audioTitle = document.getElementById('audioTitle');
const audioStatus = document.getElementById('audioStatus');
const playBtn = document.getElementById('playBtn');
const repeatBtn = document.getElementById('repeatBtn');
const audioPrevBtn = document.getElementById('audioPrevBtn');
const audioNextBtn = document.getElementById('audioNextBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const reciterSelect = document.getElementById('reciterSelect');

let repeatEnabled = false;

const reciters = {
  'ar.alafasy': {
    name: 'Sheikh Mishary Alafasy',
    source: 'https://server8.mp3quran.net/afs/',
  },
  'ar.abdulsamad': {
    name: 'Sheikh Abdul Samad',
    source: 'https://server7.mp3quran.net/basit/',
  },
  'ar.husary': {
    name: 'Sheikh Al-Husary',
    source: 'https://server13.mp3quran.net/husr/',
  },
  'ar.minshawi': {
    name: 'Sheikh Al-Minshawi',
    source: 'https://server10.mp3quran.net/minsh/',
  },
};

function setAudioSource(number, surahName = '') {
  const reciter = reciters[reciterSelect.value] ? reciterSelect.value : 'ar.alafasy';
  const reciterDetails = reciters[reciter];
  reciterSelect.value = reciter;
  audioPlayer.pause();
  const surahFile = String(number).padStart(3, '0');
  audioPlayer.src = `${reciterDetails.source}${surahFile}.mp3`;
  audioPlayer.load();
  progressBar.value = 0;
  currentTimeEl.textContent = '0:00';
  durationEl.textContent = '0:00';
  playBtn.textContent = '▶';
  playBtn.setAttribute('aria-label', 'Play');
  playBtn.title = 'Play';
  audioTitle.textContent = surahName
    ? `${reciterDetails.name} • ${surahName}`
    : reciterDetails.name;
  audioStatus.textContent = 'Ready to play from CDN.';
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function updatePlayButton() {
  const isPlaying = !audioPlayer.paused;
  playBtn.classList.toggle('is-playing', isPlaying);
  playBtn.textContent = isPlaying ? 'Ⅱ' : '▶';
  playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  playBtn.title = isPlaying ? 'Pause' : 'Play';
}

async function togglePlayback() {
  if (audioPlayer.paused) {
    try {
      await audioPlayer.play();
      audioStatus.textContent = 'Playing from CDN.';
    } catch (error) {
      audioStatus.textContent = 'Press play to start the recitation.';
      console.error(error);
    }
  } else {
    audioPlayer.pause();
    audioStatus.textContent = 'Paused.';
  }
  updatePlayButton();
}

function setSelected(number) {
  state.selected = number;
  history.replaceState(null, '', `#${number}`);
  renderSurahList();
  loadSurah(number);
}

function normalizeText(value) {
  return value?.toLowerCase().trim() || '';
}

function scrollToReadingPanel() {
  if (!window.matchMedia('(max-width: 900px)').matches) {
    return;
  }

  window.requestAnimationFrame(() => {
    document.querySelector('.content')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

function renderSurahList() {
  const query = normalizeText(searchInput.value);
  const filtered = state.surahs.filter((surah) => {
    const haystack = `${surah.number} ${surah.englishName} ${surah.name} ${surah.englishNameTranslation}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!filtered.length) {
    surahListEl.innerHTML = '<div class="empty-state">No surahs match your search.</div>';
    return;
  }

  surahListEl.innerHTML = filtered
    .map((surah) => {
      const activeClass = surah.number === state.selected ? 'active' : '';
      return `
        <button class="surah-item ${activeClass}" type="button" data-number="${surah.number}">
          <strong>${surah.number}. ${surah.englishName}</strong>
          <span>${surah.name}</span>
        </button>
      `;
    })
    .join('');

  surahListEl.querySelectorAll('.surah-item').forEach((button) => {
    button.addEventListener('click', () => setSelected(Number(button.dataset.number)));
  });
}

async function loadSurahs() {
  try {
    const response = await fetch(`${apiBase}/surah`);
    if (!response.ok) throw new Error('Unable to load surah list');
    const data = await response.json();
    state.surahs = data.data || [];
    renderSurahList();

    const requested = Number(location.hash.replace('#', '')) || state.surahs[0]?.number || 1;
    setSelected(requested);
  } catch (error) {
    surahListEl.innerHTML = '<div class="empty-state">Unable to load the Quran data right now.</div>';
    loader.textContent = 'Unable to load surah details.';
    console.error(error);
  }
}

async function loadSurah(number) {
  loader.hidden = false;
  surahContent.hidden = true;

  try {
    const surahResponse = await fetch(`${apiBase}/surah/${number}`);

    if (!surahResponse.ok) {
      throw new Error('Surah could not be loaded');
    }

    const surahData = await surahResponse.json();
    const surah = surahData.data;

    surahBadge.textContent = `Surah ${surah.number}`;
    surahTitle.textContent = `${surah.number}. ${surah.englishName}`;
    surahMeta.textContent = `${surah.englishNameTranslation} • ${surah.revelationType} • ${surah.ayahs.length} verses`;
    setAudioSource(surah.number, surah.name);

    const versesMarkup = surah.ayahs
      .filter((ayah) => {
        const normalizedText = ayah.text?.replace(/\s+/g, ' ').trim() || '';
        if (surah.number === 1) {
          return true;
        }
        return normalizedText !== 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' && normalizedText !== 'بِسۡمِ ٱللّٰهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ';
      })
      .map((ayah) => `
          <div class="ayah">
            <div class="ayah-number">${ayah.numberInSurah}</div>
            <p class="ayah-text">${ayah.text}</p>
          </div>
        `)
      .join('');

    surahContent.innerHTML = `
      <div class="surah-intro">
        <h3>${surah.name}</h3>
        <p>${surah.englishNameTranslation}</p>
      </div>
      <div class="verses">${versesMarkup}</div>
    `;

    surahContent.hidden = false;
    loader.hidden = true;
    scrollToReadingPanel();
  } catch (error) {
    loader.textContent = 'Unable to load this surah right now.';
    console.error(error);
  }
}

prevBtn.addEventListener('click', () => {
  const previous = Math.max(1, state.selected - 1);
  setSelected(previous);
});

nextBtn.addEventListener('click', () => {
  const next = Math.min(114, state.selected + 1);
  setSelected(next);
});

playBtn.addEventListener('click', togglePlayback);

repeatBtn.addEventListener('click', () => {
  repeatEnabled = !repeatEnabled;
  repeatBtn.classList.toggle('active', repeatEnabled);
  repeatBtn.setAttribute('aria-label', repeatEnabled ? 'Repeat on' : 'Repeat off');
  repeatBtn.title = repeatEnabled ? 'Repeat on' : 'Repeat off';
});

audioPrevBtn.addEventListener('click', () => {
  setSelected(Math.max(1, state.selected - 1));
});

audioNextBtn.addEventListener('click', () => {
  setSelected(Math.min(114, state.selected + 1));
});

progressBar.addEventListener('input', () => {
  if (audioPlayer.duration) {
    audioPlayer.currentTime = (Number(progressBar.value) / 100) * audioPlayer.duration;
  }
});

audioPlayer.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener('timeupdate', () => {
  progressBar.value = audioPlayer.duration ? (audioPlayer.currentTime / audioPlayer.duration) * 100 : 0;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener('play', updatePlayButton);
audioPlayer.addEventListener('pause', updatePlayButton);
audioPlayer.addEventListener('ended', () => {
  if (repeatEnabled) {
    audioPlayer.currentTime = 0;
    audioPlayer.play();
    return;
  }
  updatePlayButton();
  audioStatus.textContent = 'Recitation complete.';
});

audioPlayer.addEventListener('error', () => {
  audioStatus.textContent = 'Unable to load this recitation.';
  updatePlayButton();
});

searchInput.addEventListener('input', renderSurahList);

reciterSelect.addEventListener('change', () => {
  const selectedSurah = state.surahs.find((surah) => surah.number === state.selected);
  setAudioSource(state.selected, selectedSurah?.name || '');
});

loadSurahs();
