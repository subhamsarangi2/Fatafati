// ── Sound effects ──
const _cache = {};

function playSound(file) {
  try {
    if (!_cache[file]) {
      _cache[file] = new Audio(`/assets/sounds/${file}`);
    }
    const audio = _cache[file];
    audio.currentTime = 0;
    audio.play().catch(() => {}); // silently ignore autoplay blocks
  } catch (_) {}
}

// 3 positive situations
function soundCorrectAnswer()   { playSound('correct_answer.wav'); }
function soundPassedTopic()     { playSound('passed_topic.wav'); }
function soundPassedMilestone() { playSound('passed_milestone.wav'); }

// 3 negative situations
function soundWrongAnswer()     { playSound('wrong_everything.wav'); }
function soundFailedTopic()     { playSound('wrong_everything.wav'); }
function soundFailedMilestone() { playSound('wrong_everything.wav'); }
