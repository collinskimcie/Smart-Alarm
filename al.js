const nameInput = document.querySelector("#name");
const dateTimeInput = document.querySelector("#alarm-datetime");
const toneSelect = document.querySelector("#tone");
const volumeInput = document.querySelector("#volume");
const repeatCheckbox = document.querySelector("#repeat");
const presetButtons = document.querySelectorAll(".preset");
const setButton = document.querySelector("#set-alarm");
const stopButton = document.querySelector("#stop-alarm");
const snoozeButton = document.querySelector("#snooze-alarm");
const output = document.querySelector("#output");
const countdown = document.querySelector("#countdown");
const progressBar = document.querySelector("#progress");
const themeToggle = document.querySelector("#theme-toggle");
const appCard = document.querySelector(".app-card");

let audioContext;
let gainNode;
let activeOscillators = [];
let alarmTimeout = null;
let countdownTimer = null;

const storageKey = "smart-alarm-settings";
const defaultSettings = {
  name: "",
  alarmDateTime: "",
  tone: "emotional",
  volume: 60,
  repeat: false,
  theme: "dark"
};

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return stored ? { ...defaultSettings, ...stored } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

function applySettings(settings) {
  nameInput.value = settings.name;
  dateTimeInput.value = settings.alarmDateTime;
  toneSelect.value = settings.tone;
  volumeInput.value = settings.volume;
  repeatCheckbox.checked = settings.repeat;
  document.body.classList.toggle("theme-light", settings.theme === "light");
  themeToggle.textContent = settings.theme === "light" ? "Dark mode" : "Light mode";
}

function currentSettings() {
  return {
    name: nameInput.value.trim(),
    alarmDateTime: dateTimeInput.value,
    tone: toneSelect.value,
    volume: Number(volumeInput.value),
    repeat: repeatCheckbox.checked,
    theme: document.body.classList.contains("theme-light") ? "light" : "dark"
  };
}

function updatePresetActive() {
  presetButtons.forEach((button) => {
    const offset = Number(button.dataset.offset);
    const presetTime = formatDatetimeLocal(new Date(Date.now() + offset * 60000));
    button.classList.toggle("active", dateTimeInput.value === presetTime);
  });
}

function setStatus(message, isError = false) {
  output.textContent = message;
  output.style.color = isError ? "#ff8fa6" : "";
}

function setCountdownText(secondsLeft) {
  if (secondsLeft <= 0) {
    countdown.textContent = "Ringing now. Press Stop or Snooze.";
    return;
  }
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  countdown.textContent = `Alarm in ${minutes}m ${seconds}s`;
}

function formatDatetimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function updateProgress(elapsed, total) {
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  progressBar.style.width = `${progress}%`;
}

function animateRinging(isRinging) {
  appCard.classList.toggle("ringing", isRinging);
}

function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  if (!gainNode) {
    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
  }
}

function createOscillator(frequency, start, duration, wave = "sine") {
  const oscillator = audioContext.createOscillator();
  const noteGain = audioContext.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.connect(noteGain);

  noteGain.gain.setValueAtTime(0, start);
  noteGain.gain.linearRampToValueAtTime(1, start + 0.05);
  noteGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  noteGain.connect(gainNode);

  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
  activeOscillators.push(oscillator);
}

function playTonePreset(tone, volume) {
  initAudio();

  gainNode.gain.setValueAtTime(volume / 200, audioContext.currentTime);
  activeOscillators.forEach((osc) => {
    try { osc.stop(); } catch (e) {}
  });
  activeOscillators = [];

  const now = audioContext.currentTime;
  if (tone === "emotional") {
    const melody = [440, 392, 349, 330, 392, 440];
    const durations = [0.8, 0.8, 0.8, 0.8, 0.8, 1.4];
    let time = now;
    melody.forEach((freq, index) => {
      createOscillator(freq, time, durations[index], "sine");
      time += durations[index] * 0.9;
    });
    const drone = audioContext.createOscillator();
    drone.type = "triangle";
    drone.frequency.setValueAtTime(220, now);
    const droneGain = audioContext.createGain();
    droneGain.gain.setValueAtTime(0.03, now);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    drone.connect(droneGain);
    droneGain.connect(gainNode);
    drone.start(now);
    drone.stop(time + 0.5);
    activeOscillators.push(drone);
  } else if (tone === "chime") {
    const melody = [523, 659, 784, 987];
    let time = now;
    melody.forEach((freq) => {
      createOscillator(freq, time, 0.5, "triangle");
      time += 0.45;
    });
  } else {
    const melody = [330, 392, 440, 392];
    let time = now;
    melody.forEach((freq) => {
      createOscillator(freq, time, 0.5, "square");
      time += 0.55;
    });
  }
}

function stopRingtone() {
  if (gainNode && audioContext) {
    gainNode.gain.cancelScheduledValues(audioContext.currentTime);
    gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.02);
  }
  activeOscillators.forEach((osc) => {
    try { osc.stop(); } catch (e) {}
  });
  activeOscillators = [];
  animateRinging(false);
}

function clearTimers() {
  if (alarmTimeout) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function showControlButtons(isRinging) {
  stopButton.classList.toggle("hidden", !isRinging);
  snoozeButton.classList.toggle("hidden", !isRinging);
  setButton.disabled = isRinging;
}

function scheduleAlarm() {
  clearTimers();
  stopRingtone();

  const person = nameInput.value.trim() || "Friend";
  const selected = new Date(dateTimeInput.value);
  const tone = toneSelect.value;
  const volume = Number(volumeInput.value);
  const repeat = repeatCheckbox.checked;

  if (isNaN(selected.getTime()) || selected.getTime() <= Date.now()) {
    setStatus("Please choose a future date and time for the alarm.", true);
    return;
  }

  const totalTime = Math.round((selected.getTime() - Date.now()) / 1000);
  const endTime = selected.getTime();
  setStatus(`Alarm scheduled for ${selected.toLocaleString()}.`);
  setCountdownText(totalTime);
  updateProgress(0, totalTime);

  showControlButtons(false);
  appCard.classList.remove("ringing");

  countdownTimer = setInterval(() => {
    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    setCountdownText(remaining);
    updateProgress(totalTime - remaining, totalTime);
  }, 250);

  alarmTimeout = setTimeout(() => {
    clearInterval(countdownTimer);
    countdownTimer = null;
    setStatus(`Wake up, ${person}!`, false);
    setCountdownText(0);
    updateProgress(totalTime, totalTime);
    playTonePreset(tone, volume);
    animateRinging(true);
    showControlButtons(true);

    if (repeat) {
      setStatus(`Alarm ringing. Auto-repeat is on, next ring in 60 seconds.`);
      alarmTimeout = setTimeout(() => {
        scheduleAlarm();
      }, 60000);
    }
  }, selected.getTime() - Date.now());

  saveSettings(currentSettings());
  updatePresetActive();
}

function snoozeAlarm() {
  stopRingtone();
  clearTimers();
  showControlButtons(false);

  const snoozeTime = new Date(Date.now() + 30 * 1000);
  dateTimeInput.value = formatDatetimeLocal(snoozeTime);
  updatePresetActive();
  setStatus("Snoozed for 30 seconds. Relax a moment.");
  scheduleAlarm();
}

function toggleTheme() {
  const isLight = document.body.classList.toggle("theme-light");
  themeToggle.textContent = isLight ? "Dark mode" : "Light mode";
  saveSettings(currentSettings());
}

function setDefaultDateTime() {
  if (!dateTimeInput.value) {
    const next = new Date(Date.now() + 10 * 60 * 1000);
    dateTimeInput.value = formatDatetimeLocal(next);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const settings = loadSettings();
  applySettings(settings);
  setDefaultDateTime();
  updatePresetActive();
  const selected = new Date(dateTimeInput.value);
  setCountdownText(Math.max(0, Math.round((selected.getTime() - Date.now()) / 1000)));
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const offset = Number(button.dataset.offset);
    const next = new Date(Date.now() + offset * 60000);
    dateTimeInput.value = formatDatetimeLocal(next);
    updatePresetActive();
  });
});

setButton.addEventListener("click", scheduleAlarm);
stopButton.addEventListener("click", () => {
  clearTimers();
  stopRingtone();
  showControlButtons(false);
  setStatus("Alarm stopped.");
  countdown.textContent = "Waiting...";
  progressBar.style.width = "0%";
});
snoozeButton.addEventListener("click", snoozeAlarm);
themeToggle.addEventListener("click", toggleTheme);

[ nameInput, dateTimeInput, toneSelect, volumeInput, repeatCheckbox ].forEach((input) => {
  input.addEventListener("change", () => saveSettings(currentSettings()));
});

dateTimeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    scheduleAlarm();
  }
});
