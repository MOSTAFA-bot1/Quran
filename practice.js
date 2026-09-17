const apiBase = 'https://api.alquran.cloud/v1';
const state = {
  surahs: [],
  selectedSurah: null,
  currentVerseIndex: 0,
  verses: [],
  isRecording: false,
  audioContext: null,
  analyser: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartTime: null,
  recordingTimer: null,
  recordings: [],
  currentRecordingBlob: null,
  currentRecordingUrl: null,
  verseRevealed: false,
  voiceActivityLevel: 0,
  speechDetected: false,
  silenceStartTime: null,
  autoRevealEnabled: true,
  autoNextEnabled: true,
  silenceThreshold: 2000 // 2 seconds of silence before auto-next
};

// DOM Elements
const surahSelect = document.getElementById('surahSelect');
const difficultyLevel = document.getElementById('difficultyLevel');
const autoRevealToggle = document.getElementById('autoRevealToggle');
const autoNextToggle = document.getElementById('autoNextToggle');
const themeToggle = document.getElementById('themeToggle');
const verseContainer = document.getElementById('verseContainer');
const verseHint = document.getElementById('verseHint');
const verseDisplay = document.getElementById('verseDisplay');
const verseText = document.getElementById('verseText');
const revealBtn = document.getElementById('revealBtn');
const nextVerseBtn = document.getElementById('nextVerseBtn');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const playRecordingBtn = document.getElementById('playRecordingBtn');
const compareBtn = document.getElementById('compareBtn');
const audioVisualizer = document.getElementById('audioVisualizer');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
const historyList = document.getElementById('historyList');
const sessionsToday = document.getElementById('sessionsToday');
const totalRecordings = document.getElementById('totalRecordings');
const versesPracticed = document.getElementById('versesPracticed');

// Theme Management
function applyTheme(isLight) {
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  themeToggle.checked = isLight;
  themeToggle.setAttribute('aria-label', isLight ? 'Use dark mode' : 'Use light mode');
}

const savedTheme = localStorage.getItem('quran-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('change', () => {
  const isLight = themeToggle.checked;
  localStorage.setItem('quran-theme', isLight ? 'light' : 'dark');
  applyTheme(isLight);
});

// Auto-reveal and auto-next toggle handlers
autoRevealToggle.addEventListener('change', () => {
  state.autoRevealEnabled = autoRevealToggle.checked;
  localStorage.setItem('quran-auto-reveal', state.autoRevealEnabled);
});

autoNextToggle.addEventListener('change', () => {
  state.autoNextEnabled = autoNextToggle.checked;
  localStorage.setItem('quran-auto-next', state.autoNextEnabled);
});

// Load saved toggle states
const savedAutoReveal = localStorage.getItem('quran-auto-reveal');
const savedAutoNext = localStorage.getItem('quran-auto-next');
if (savedAutoReveal !== null) {
  state.autoRevealEnabled = savedAutoReveal === 'true';
  autoRevealToggle.checked = state.autoRevealEnabled;
}
if (savedAutoNext !== null) {
  state.autoNextEnabled = savedAutoNext === 'true';
  autoNextToggle.checked = state.autoNextEnabled;
}

// Initialize Audio Context
function initAudioContext() {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return state.audioContext;
}

// Load Surahs
async function loadSurahs() {
  try {
    const response = await fetch(`${apiBase}/surah`);
    if (!response.ok) throw new Error('Unable to load surah list');
    const data = await response.json();
    state.surahs = data.data || [];
    
    if (state.surahs.length === 0) {
      surahSelect.innerHTML = '<option value="">No surahs available</option>';
      return;
    }
    
    surahSelect.innerHTML = '<option value="">Select a surah</option>' +
      state.surahs.map(surah => 
        `<option value="${surah.number}">${surah.number}. ${surah.name} - ${surah.englishName}</option>`
      ).join('');
  } catch (error) {
    console.error('Error loading surahs:', error);
    surahSelect.innerHTML = '<option value="">Error loading surahs</option>';
    verseHint.innerHTML = '<p>Unable to load surah data. Please check your internet connection.</p>';
  }
}

// Load Verses for Selected Surah
async function loadVerses() {
  const surahNumber = surahSelect.value;
  if (!surahNumber) {
    verseHint.innerHTML = '<p>Select a surah to begin practice</p><p class="hint-text">The verse will appear as you recite</p>';
    return;
  }

  try {
    verseHint.innerHTML = '<p>Loading verses...</p>';
    const response = await fetch(`${apiBase}/surah/${surahNumber}`);
    if (!response.ok) throw new Error('Unable to load surah');
    const data = await response.json();
    const surah = data.data;
    
    if (!surah || !surah.ayahs || surah.ayahs.length === 0) {
      throw new Error('Invalid surah data received');
    }
    
    state.selectedSurah = surah;
    
    // Load verses for memorization practice
    loadVersesForPractice();
  } catch (error) {
    console.error('Error loading verses:', error);
    verseHint.innerHTML = '<p>Error loading verses. Please try again.</p>';
  }
}

function loadVersesForPractice() {
  if (!state.selectedSurah || !state.selectedSurah.ayahs) {
    console.error('Invalid surah data');
    return;
  }
  
  state.currentVerseIndex = 0;
  state.verseRevealed = false;
  
  // Get all verses for practice
  state.verses = state.selectedSurah.ayahs.map(ayah => ({
    number: ayah.numberInSurah,
    text: ayah.text
  })).filter(ayah => ayah.text); // Filter out empty verses
  
  if (state.verses.length === 0) {
    verseHint.innerHTML = '<p>No verses found in this surah.</p>';
    return;
  }
  
  // Reset display
  verseHint.innerHTML = `
    <p>Surah ${state.selectedSurah.name} - All ${state.verses.length} verses</p>
    <p class="hint-text">Start recording to practice memorization</p>
    <p class="verse-counter">Verse ${state.currentVerseIndex + 1} of ${state.verses.length}</p>
  `;
  verseDisplay.classList.add('hidden');
  revealBtn.disabled = true;
  nextVerseBtn.disabled = true;
}

function updateVerseDisplay() {
  loadVersesForPractice();
}

function revealVerse() {
  if (state.verses.length === 0 || state.currentVerseIndex >= state.verses.length) return;
  
  const currentVerse = state.verses[state.currentVerseIndex];
  verseText.textContent = currentVerse.text;
  verseDisplay.classList.remove('hidden');
  verseHint.classList.add('hidden');
  state.verseRevealed = true;
  
  revealBtn.disabled = true;
  nextVerseBtn.disabled = false;
}

function nextVerse() {
  if (state.currentVerseIndex < state.verses.length - 1) {
    state.currentVerseIndex++;
    state.verseRevealed = false;
    
    // Reset display for next verse
    verseDisplay.classList.add('hidden');
    verseHint.classList.remove('hidden');
    verseHint.innerHTML = `
      <p>Surah ${state.selectedSurah.name} - All ${state.verses.length} verses</p>
      <p class="hint-text">Start recording to practice the next verse</p>
      <p class="verse-counter">Verse ${state.currentVerseIndex + 1} of ${state.verses.length}</p>
    `;
    
    revealBtn.disabled = false;
    nextVerseBtn.disabled = true;
  } else {
    // All verses completed
    verseHint.innerHTML = `
      <p>🎉 Congratulations!</p>
      <p class="hint-text">You have completed all verses in this practice session</p>
    `;
    verseDisplay.classList.add('hidden');
    revealBtn.disabled = true;
    nextVerseBtn.disabled = true;
  }
}

// Audio Visualization
function setupVisualizer(stream) {
  try {
    const audioContext = initAudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const canvas = audioVisualizer;
    if (!canvas) {
      console.error('Audio visualizer canvas not found');
      return;
    }
    
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      console.error('Unable to get canvas context');
      return;
    }
    
    function draw() {
      if (!state.isRecording) return;
      
      requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate voice activity level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      state.voiceActivityLevel = average;
      
      // Voice activity detection
      const speechThreshold = 10; // Threshold for speech detection
      const isSpeaking = average > speechThreshold;
      
      if (isSpeaking && !state.speechDetected) {
        state.speechDetected = true;
        state.silenceStartTime = null;
        
        // Auto-reveal verse when speech is detected
        if (state.autoRevealEnabled && !state.verseRevealed && state.verses.length > 0) {
          revealVerse();
        }
      } else if (!isSpeaking && state.speechDetected) {
        // Speech stopped, start silence timer
        if (!state.silenceStartTime) {
          state.silenceStartTime = Date.now();
        } else if (Date.now() - state.silenceStartTime > state.silenceThreshold) {
          // Auto-next verse after silence period
          if (state.autoNextEnabled && state.verseRevealed) {
            nextVerse();
            state.speechDetected = false;
            state.silenceStartTime = null;
          }
        }
      }
      
      canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#48b2a5');
        gradient.addColorStop(1, '#86d2c1');
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    }
    
    draw();
  } catch (error) {
    console.error('Error setting up visualizer:', error);
  }
}

// Recording Controls
async function startRecording() {
  // Check if we have verses to practice
  if (state.verses.length === 0) {
    alert('Please select a surah first before recording.');
    return;
  }
  
  try {
    initAudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    state.mediaRecorder = new MediaRecorder(stream);
    state.recordedChunks = [];
    
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    };
    
    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recordedChunks, { type: 'audio/webm' });
      state.currentRecordingBlob = blob;
      state.currentRecordingUrl = URL.createObjectURL(blob);
      
      // Enable buttons
      playRecordingBtn.disabled = false;
      compareBtn.disabled = false;
      
      // Enable reveal button if verse not yet revealed
      if (!state.verseRevealed && state.verses.length > 0) {
        revealBtn.disabled = false;
      }
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    state.mediaRecorder.start();
    state.isRecording = true;
    state.recordingStartTime = Date.now();
    
    // Reset voice detection state
    state.speechDetected = false;
    state.silenceStartTime = null;
    state.voiceActivityLevel = 0;
    
    // Auto-reveal verse after 3 seconds of recording as backup
    setTimeout(() => {
      if (state.isRecording && !state.verseRevealed && state.verses.length > 0 && !state.speechDetected) {
        revealVerse();
      }
    }, 3000);
    
    // Update UI
    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '<span class="record-icon">●</span><span class="record-text">Recording...</span>';
    stopBtn.disabled = false;
    recordingIndicator.classList.add('active');
    
    // Setup visualizer
    setupVisualizer(stream);
    
    // Start timer
    updateRecordingTimer();
    state.recordingTimer = setInterval(updateRecordingTimer, 1000);
    
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Unable to access microphone. Please ensure microphone permissions are granted and try using HTTPS if accessing from a remote server.');
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.isRecording) {
    state.mediaRecorder.stop();
    state.isRecording = false;
    
    // Reset voice detection state
    state.speechDetected = false;
    state.silenceStartTime = null;
    state.voiceActivityLevel = 0;
    
    // Update UI
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<span class="record-icon">●</span><span class="record-text">Record</span>';
    stopBtn.disabled = true;
    recordingIndicator.classList.remove('active');
    
    // Stop timer
    clearInterval(state.recordingTimer);
    
    // Clear visualizer
    if (audioVisualizer) {
      const canvasCtx = audioVisualizer.getContext('2d');
      if (canvasCtx) {
        canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        canvasCtx.fillRect(0, 0, audioVisualizer.width, audioVisualizer.height);
      }
    }
  }
}

function updateRecordingTimer() {
  if (!state.recordingStartTime) return;
  
  const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  recordingTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

recordBtn.addEventListener('click', () => {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

stopBtn.addEventListener('click', stopRecording);

// Play Recording
playRecordingBtn.addEventListener('click', async () => {
  if (!state.currentRecordingUrl) return;
  
  const audio = new Audio(state.currentRecordingUrl);
  try {
    await audio.play();
    playRecordingBtn.textContent = 'Ⅱ';
    
    audio.onended = () => {
      playRecordingBtn.textContent = '▶ Play';
    };
  } catch (error) {
    console.error('Error playing recording:', error);
  }
});

compareBtn.addEventListener('click', () => {
  saveRecordingToHistory();
  alert('Recording saved to history!');
});

// Save Recording to History
function saveRecordingToHistory() {
  const recording = {
    id: Date.now(),
    surah: state.selectedSurah ? `${state.selectedSurah.number}. ${state.selectedSurah.name}` : 'Unknown',
    verses: `Verse ${state.currentVerseIndex + 1}`,
    date: new Date().toLocaleString(),
    blob: state.currentRecordingBlob
  };
  
  state.recordings.unshift(recording);
  updateHistoryDisplay();
  updateStats();
}

function updateHistoryDisplay() {
  if (state.recordings.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No recordings yet. Start practicing!</div>';
    return;
  }
  
  historyList.innerHTML = state.recordings.slice(0, 10).map(recording => `
    <div class="history-item">
      <div class="history-info">
        <span class="history-surah">${recording.surah} (${recording.verses})</span>
        <span class="history-date">${recording.date}</span>
      </div>
      <div class="history-actions">
        <button class="history-btn" onclick="playHistoryRecording(${recording.id})">Play</button>
        <button class="history-btn" onclick="deleteHistoryRecording(${recording.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  const today = new Date().toDateString();
  const todaySessions = state.recordings.filter(r => 
    new Date(r.date).toDateString() === today
  ).length;
  
  sessionsToday.textContent = todaySessions;
  totalRecordings.textContent = state.recordings.length;
  versesPracticed.textContent = state.recordings.length; // Each recording is one verse
}

// Global functions for history buttons
window.playHistoryRecording = function(id) {
  const recording = state.recordings.find(r => r.id === id);
  if (recording && recording.blob) {
    const url = URL.createObjectURL(recording.blob);
    const audio = new Audio(url);
    audio.play();
  }
};

window.deleteHistoryRecording = function(id) {
  state.recordings = state.recordings.filter(r => r.id !== id);
  updateHistoryDisplay();
  updateStats();
};

// Event Listeners
surahSelect.addEventListener('change', loadVerses);
revealBtn.addEventListener('click', revealVerse);
nextVerseBtn.addEventListener('click', nextVerse);

// Initialize
try {
  loadSurahs();
  updateStats();
} catch (error) {
  console.error('Error initializing application:', error);
  verseHint.innerHTML = '<p>Error initializing application. Please refresh the page.</p>';
}