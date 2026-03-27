const FIRST_TOPIC_EDGE_URL = 'https://hqbspprcvkoopufningr.supabase.co/functions/v1/first-topic';
const FIRST_TOPIC_CACHE_KEY = 'fatafati_first_topic';
const FIRST_TOPIC_CACHE_TTL = 60 * 60 * 1000;

function getCachedFirstTopic() {
  try {
    const raw = localStorage.getItem(FIRST_TOPIC_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > FIRST_TOPIC_CACHE_TTL) { localStorage.removeItem(FIRST_TOPIC_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function setCachedFirstTopic(data) {
  try { localStorage.setItem(FIRST_TOPIC_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

const params = new URLSearchParams(window.location.search);
const slug = params.get('slug');
const milestoneId = params.get('milestone');

let user = null;
let topic = null;
let questions = [];
let answers = {};
let wrongCount = 0;
let quizSubmitted = false;
const MAX_WRONG_TOPIC = 3;
const MAX_WRONG_MILESTONE = 5;

document.addEventListener('DOMContentLoaded', async function () {
  user = await getUser();
  updateNavAuth(user);

  if (milestoneId) {
    if (!user) { window.location.href = '/?login=1&back=learn.html'; return; }
    await loadMilestoneTest();
  } else if (slug) {
    if (!user) {
      // Check if this is the very first topic — allow preview, gate quiz interaction
      const { data: firstTopic } = await supabaseClient
        .from('topics')
        .select('slug')
        .order('order_index', { ascending: true })
        .limit(1)
        .single();

      if (firstTopic?.slug === slug) {
        await loadTopic(true); // preview mode
      } else {
        window.location.href = '/?login=1&back=learn.html';
      }
      return;
    }
    await loadTopic(false);
  } else {
    window.location.href = '/learn.html';
  }
});

async function loadTopic(previewMode = false) {
  let data, error;

  if (previewMode) {
    // Try localStorage first, then Edge Function, then direct DB
    const cached = getCachedFirstTopic();
    if (cached) {
      console.log('%c[First Topic] localStorage cache HIT', 'color:#16a34a;font-weight:bold;');
      data = cached;
    } else {
      try {
        const res = await fetch(FIRST_TOPIC_EDGE_URL);
        if (!res.ok) throw new Error(`Edge function ${res.status}`);
        const cacheStatus = res.headers.get('X-Cache') ?? 'UNKNOWN';
        console.log(`%c[First Topic] Edge Function ${cacheStatus}`, `color:${cacheStatus === 'HIT' ? '#0A3161' : '#ca8a04'};font-weight:bold;`);
        data = await res.json();
        setCachedFirstTopic(data);
      } catch (edgeErr) {
        console.warn('%c[First Topic] Edge Function failed — falling back to DB', 'color:#B31942;font-weight:bold;', edgeErr);
        const result = await supabaseClient
          .from('topics')
          .select('*, milestones(title, id), questions(*)')
          .order('order_index', { ascending: true })
          .limit(1)
          .single();
        data = result.data;
        error = result.error;
        if (data) setCachedFirstTopic(data);
      }
    }
  } else {
    const result = await supabaseClient
      .from('topics')
      .select('*, milestones(title, id)')
      .eq('slug', slug)
      .single();
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    document.getElementById('page-content').innerHTML = '<div class="alert alert-error mt-5">Topic not found.</div>';
    return;
  }

  topic = data;
  document.title = `${topic.title} – Fatafati`;

  const progress = user ? await getUserProgress(user.id) : null;
  const unlocked = progress?.unlocked_topics ?? [];

  const ms = topic.milestones;
  const breadcrumb = `
    <div class="breadcrumb">
      <a href="learn.html">Lessons</a>
      <i class="fa-solid fa-chevron-right"></i>
      <a href="learn.html">${ms?.title ?? 'Milestone'}</a>
      <i class="fa-solid fa-chevron-right"></i>
      <span>${topic.title}</span>
    </div>
  `;

  const { data: qs } = previewMode && data.questions
    ? { data: data.questions }
    : await supabaseClient
        .from('questions')
        .select('*')
        .eq('topic_id', topic.id)
        .limit(10);

  questions = qs || [];

  const lessonHtml = topic.body_markdown
    ? marked.parse(topic.body_markdown)
    : '<p>No lesson content yet.</p>';

  const sidebarContent = questions.length > 0
    ? renderQuizForm('Topic Test', questions, MAX_WRONG_TOPIC, previewMode)
    : `<div class="quiz-section"><p class="text-muted">No quiz available for this topic yet.</p></div>`;

  document.getElementById('page-content').innerHTML = `
    <div class="topic-layout">
      <div>
        ${breadcrumb}
        ${previewMode ? `<div class="alert alert-info mb-3" style="margin-bottom:1.5rem;"><i class="fa-solid fa-eye"></i> You're previewing this lesson. <a href="/?login=1" style="font-weight:700;">Sign in</a> to take the quiz and track your progress.</div>` : ''}
        <div class="lesson-body">
          <h1 style="font-size:2rem;margin-bottom:1.5rem;">${topic.title}</h1>
          ${topic.image_url ? `<img src="${topic.image_url}" alt="${topic.title}" style="border-radius:var(--radius);margin-bottom:2rem;max-height:320px;width:100%;object-fit:cover;" />` : ''}
          ${lessonHtml}
        </div>
      </div>
      <aside class="topic-sidebar">
        <div class="quiz-section" style="padding:1.75rem 2rem;">
          <div style="font-size:0.82rem;color:var(--grey);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:0.25rem;">Milestone</div>
          <div style="font-size:1rem;font-weight:600;">${ms?.title ?? ''}</div>
        </div>
        ${sidebarContent}
      </aside>
    </div>
  `;

  if (questions.length > 0) bindQuizEvents('topic', previewMode);
}

async function loadMilestoneTest() {
  const { data: ms, error } = await supabaseClient
    .from('milestones')
    .select('*')
    .eq('id', milestoneId)
    .single();

  if (error || !ms) {
    window.location.href = '/learn.html';
    return;
  }

  document.title = `${ms.title} Test – Fatafati`;

  const { data: qs } = await supabaseClient
    .from('questions')
    .select('*')
    .eq('milestone_id', milestoneId)
    .limit(25);

  questions = qs || [];

  const breadcrumb = `
    <div class="breadcrumb">
      <a href="learn.html">Lessons</a>
      <i class="fa-solid fa-chevron-right"></i>
      <span>${ms.title} Test</span>
    </div>
  `;

  document.getElementById('page-content').innerHTML = `
    <div style="padding:3rem 0;max-width:720px;margin:0 auto;">
      ${breadcrumb}
      <div class="lesson-body" style="margin-bottom:2rem;">
        <h1 style="font-size:2rem;">${ms.title} — Milestone Test</h1>
        <p style="color:var(--grey);margin-top:0.75rem;">${ms.description || 'Complete this test to unlock the next milestone.'}</p>
        <div class="alert alert-info mt-3">
          <i class="fa-solid fa-circle-info"></i> 25 questions &nbsp;·&nbsp; You can get at most <strong>5 wrong</strong> to pass.
        </div>
      </div>
      ${questions.length === 0
        ? `<div class="alert alert-info mt-3"><i class="fa-solid fa-circle-info"></i> No questions have been added to this milestone test yet.</div>`
        : renderQuizForm(ms.title + ' Test', questions, MAX_WRONG_MILESTONE)
      }
    </div>
  `;

  if (questions.length > 0) bindQuizEvents('milestone');
}

function renderQuizForm(title, qs, maxWrong, previewMode = false) {
  if (!qs.length) return `<div class="quiz-section"><p class="text-muted">No questions available yet.</p></div>`;

  let html = `<div class="quiz-section" id="quiz-container">
    <h3>${title}</h3>
    ${previewMode
      ? `<p class="text-muted" style="font-size:0.88rem;margin-bottom:1.75rem;">Try the first question — <a href="/?login=1" style="font-weight:700;">sign in</a> to complete the full quiz.</p>`
      : `<p class="text-muted" style="font-size:0.88rem;margin-bottom:1.75rem;">Pass by getting fewer than ${maxWrong + 1} questions wrong.</p>`
    }
    <div class="quiz-progress">
      <span id="q-progress">Question 1 of ${qs.length}</span>
      <span>Wrong: <span class="wrong-counter" id="wrong-count">0</span> / ${maxWrong}</span>
    </div>
    <div id="questions-container">`;

  qs.forEach((q, i) => {
    const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]');
    html += `
      <div class="question-block" id="q-${i}" style="${i > 0 ? 'display:none;' : ''}">
        <div class="question-text">${i + 1}. ${q.question_text}</div>
        <div class="options">
          ${opts.map((opt, oi) => `
            <label class="option-label" id="opt-${i}-${oi}">
              <input type="radio" name="q-${i}" value="${oi}" />
              ${opt}
            </label>
          `).join('')}
        </div>
        <button class="btn btn-primary mt-3" id="submit-q-${i}" style="display:none;" data-qi="${i}">
          Confirm Answer <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    `;
  });

  html += `</div>
    <div id="quiz-result" style="display:none;"></div>
  </div>`;

  return html;
}

function bindQuizEvents(type, previewMode = false) {
  let currentQ = 0;

  document.addEventListener('change', function (e) {
    if (e.target.type !== 'radio') return;
    const qi = parseInt(e.target.name.split('-')[1]);

    // In preview mode, redirect on any option selection
    if (previewMode) {
      window.location.href = '/?login=1';
      return;
    }

    const btn = document.getElementById(`submit-q-${qi}`);
    if (btn) btn.style.display = 'inline-flex';
  });

  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('[id^="submit-q-"]');
    if (!btn) return;
    const qi = parseInt(btn.dataset.qi);
    const q = questions[qi];
    const selected = document.querySelector(`input[name="q-${qi}"]:checked`);
    if (!selected) return;

    const selectedInt = parseInt(selected.value);
    const isCorrect = selectedInt === q.correct_option;

    document.querySelectorAll(`input[name="q-${qi}"]`).forEach(r => r.disabled = true);
    btn.style.display = 'none';

    if (isCorrect) {
      document.getElementById(`opt-${qi}-${selectedInt}`)?.classList.add('correct');
      soundCorrectAnswer();
    } else {
      document.getElementById(`opt-${qi}-${selectedInt}`)?.classList.add('wrong');
      document.getElementById(`opt-${qi}-${q.correct_option}`)?.classList.add('correct');
      wrongCount++;
      document.getElementById('wrong-count').textContent = wrongCount;
      soundWrongAnswer();
    }

    const maxWrong = type === 'topic' ? MAX_WRONG_TOPIC : MAX_WRONG_MILESTONE;

    if (wrongCount > maxWrong) {
      document.getElementById('questions-container').innerHTML = `<div style="text-align:center;padding:2rem 0;"><div class="spinner"></div><p style="color:var(--grey);font-size:0.9rem;margin-top:0.5rem;">Saving result...</p></div>`;
      await recordAttempt(false, type);
      showResult(false, type);
      return;
    }

    currentQ = qi + 1;

    if (currentQ >= questions.length) {
      document.getElementById('questions-container').innerHTML = `<div style="text-align:center;padding:2rem 0;"><div class="spinner"></div><p style="color:var(--grey);font-size:0.9rem;margin-top:0.5rem;">Saving result...</p></div>`;
      await recordAttempt(true, type);
      showResult(true, type);
      return;
    }

    setTimeout(() => {
      document.getElementById(`q-${qi}`).style.display = 'none';
      document.getElementById(`q-${currentQ}`).style.display = 'block';
      document.getElementById('q-progress').textContent = `Question ${currentQ + 1} of ${questions.length}`;
    }, 600);
  });
}

async function recordAttempt(passed, type) {
  const payload = {
    user_id: user.id,
    passed,
    score: questions.length - wrongCount,
    attempted_at: new Date().toISOString()
  };

  if (type === 'topic' && topic) {
    payload.topic_id = topic.id;
  } else if (type === 'milestone') {
    payload.milestone_id = milestoneId;
  }

  await supabaseClient.from('test_attempts').insert(payload);

  if (passed) {
    const progress = await getUserProgress(user.id);
    const existing = progress || { user_id: user.id, unlocked_topics: [], unlocked_milestones: [] };

    if (type === 'topic' && topic && !existing.unlocked_topics.includes(topic.id)) {
      existing.unlocked_topics = [...existing.unlocked_topics, topic.id];
    } else if (type === 'milestone') {
      if (!existing.unlocked_milestones.includes(milestoneId)) {
        existing.unlocked_milestones = [...existing.unlocked_milestones, milestoneId];
      }
    }

    if (progress) {
      await supabaseClient.from('user_progress').update(existing).eq('user_id', user.id);
    } else {
      await supabaseClient.from('user_progress').insert(existing);
    }
  }
}

function showResult(passed, type) {
  document.getElementById('questions-container').style.display = 'none';

  if (passed) {
    type === 'milestone' ? soundPassedMilestone() : soundPassedTopic();
  } else {
    type === 'milestone' ? soundFailedMilestone() : soundFailedTopic();
  }
  const nextLink = type === 'topic'
    ? `<a href="learn.html?scrollToNext=1" class="btn btn-primary mt-3"><i class="fa-solid fa-arrow-right"></i> Back to Lessons</a>`
    : `<a href="learn.html?scrollToNext=1" class="btn btn-primary mt-3"><i class="fa-solid fa-trophy"></i> See Next Milestone</a>`;

  const result = document.getElementById('quiz-result');
  result.innerHTML = `
    <div class="result-banner ${passed ? 'result-pass' : 'result-fail'}">
      <div class="result-icon"><i class="fa-solid fa-${passed ? 'circle-check' : 'circle-xmark'}"></i></div>
      <div class="result-title">${passed ? 'You passed!' : 'Better luck next time'}</div>
      <p class="text-muted">${passed
        ? `Great work — ${type === 'topic' ? 'the next topic is now unlocked.' : 'the next milestone is now unlocked.'}`
        : `You got ${wrongCount} questions wrong. Review the lesson and try again.`
      }</p>
      ${passed ? nextLink : `<button class="btn btn-outline mt-3" onclick="window.location.reload()"><i class="fa-solid fa-rotate-right"></i> Retry</button>`}
    </div>
  `;
  result.style.display = 'block';
}
