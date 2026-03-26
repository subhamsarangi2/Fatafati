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

  if (!user) {
    window.location.href = '?login=1';
    return;
  }

  if (milestoneId) {
    await loadMilestoneTest();
  } else if (slug) {
    await loadTopic();
  } else {
    window.location.href = '/learn.html';
  }
});

async function loadTopic() {
  const { data, error } = await supabaseClient
    .from('topics')
    .select('*, milestones(title, id)')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    document.getElementById('page-content').innerHTML = '<div class="alert alert-error mt-5">Topic not found.</div>';
    return;
  }

  topic = data;

  document.title = `${topic.title} – Fatafati`;

  const progress = await getUserProgress(user.id);
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

  const { data: qs } = await supabaseClient
    .from('questions')
    .select('*')
    .eq('topic_id', topic.id)
    .limit(10);

  questions = qs || [];

  const lessonHtml = topic.body_markdown
    ? marked.parse(topic.body_markdown)
    : '<p>No lesson content yet.</p>';

  const sidebarContent = questions.length > 0
    ? renderQuizForm('Topic Test', questions, MAX_WRONG_TOPIC)
    : `<div class="quiz-section"><p class="text-muted">No quiz available for this topic yet.</p></div>`;

  document.getElementById('page-content').innerHTML = `
    <div class="topic-layout">
      <div>
        ${breadcrumb}
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

  if (questions.length > 0) bindQuizEvents('topic');
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

function renderQuizForm(title, qs, maxWrong) {
  if (!qs.length) return `<div class="quiz-section"><p class="text-muted">No questions available yet.</p></div>`;

  let html = `<div class="quiz-section" id="quiz-container">
    <h3>${title}</h3>
    <p class="text-muted" style="font-size:0.88rem;margin-bottom:1.75rem;">Pass by getting fewer than ${maxWrong + 1} questions wrong.</p>
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

function bindQuizEvents(type) {
  let currentQ = 0;

  document.addEventListener('change', function (e) {
    if (e.target.type !== 'radio') return;
    const qi = parseInt(e.target.name.split('-')[1]);
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
    } else {
      document.getElementById(`opt-${qi}-${selectedInt}`)?.classList.add('wrong');
      document.getElementById(`opt-${qi}-${q.correct_option}`)?.classList.add('correct');
      wrongCount++;
      document.getElementById('wrong-count').textContent = wrongCount;
    }

    const maxWrong = type === 'topic' ? MAX_WRONG_TOPIC : MAX_WRONG_MILESTONE;

    if (wrongCount > maxWrong) {
      await recordAttempt(false, type);
      showResult(false, type);
      return;
    }

    currentQ = qi + 1;

    if (currentQ >= questions.length) {
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
    } else if (type === 'milestone' && !existing.unlocked_milestones.includes(milestoneId)) {
      existing.unlocked_milestones = [...existing.unlocked_milestones, milestoneId];
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
  const nextLink = type === 'topic'
    ? `<a href="learn.html" class="btn btn-primary mt-3"><i class="fa-solid fa-arrow-right"></i> Back to Lessons</a>`
    : `<a href="learn.html" class="btn btn-primary mt-3"><i class="fa-solid fa-trophy"></i> See Next Milestone</a>`;

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
