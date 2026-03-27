document.addEventListener('DOMContentLoaded', async function () {
  const user = await getUser();
  updateNavAuth(user);

  let progress = null;
  if (user) {
    progress = await getUserProgress(user.id);
  }
  renderProgressSidebar(progress);

  const { data: milestones, error } = await supabaseClient
    .from('milestones')
    .select('*, topics(id, title, slug, description, order_index)')
    .order('order_index');

  if (error || !milestones) {
    document.getElementById('curriculum-container').innerHTML =
      '<div class="alert alert-error">Failed to load lessons. Please try again.</div>';
    return;
  }

  if (milestones.length === 0) {
    document.getElementById('curriculum-container').innerHTML =
      '<div style="text-align:center;padding:4rem 0;color:var(--grey);"><i class="fa-solid fa-book-open" style="font-size:2.5rem;opacity:0.3;margin-bottom:1rem;display:block;"></i><p>No lessons available yet. Check back soon.</p></div>';
    return;
  }

  const unlockedTopics = progress?.unlocked_topics ?? [];
  const unlockedMilestones = progress?.unlocked_milestones ?? [];

  let html = '';
  milestones.forEach((ms, i) => {
    const msUnlocked = i === 0
      || unlockedMilestones.includes(ms.id)
      || (() => {
        // also unlock if all topics of the previous milestone are passed
        const prevMs = milestones[i - 1];
        if (!prevMs) return false;
        const prevTopics = (prevMs.topics || []);
        return prevTopics.length > 0 && prevTopics.every(t => unlockedTopics.includes(t.id));
      })();
    const topics = (ms.topics || []).sort((a, b) => a.order_index - b.order_index);
    const passedTopics = topics.filter(t => unlockedTopics.includes(t.id)).length;

    html += `
      <section class="milestone-section">
        <div class="milestone-header">
          <div class="milestone-number">${String(i + 1).padStart(2, '0')}</div>
          <div class="milestone-info">
            <h2>${ms.title}</h2>
            <p>${ms.description || ''}</p>
            ${user && topics.length ? `
              <div style="margin-top:0.75rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--grey);margin-bottom:0.35rem;">
                  <span>Topics completed</span><span>${passedTopics} / ${topics.length}</span>
                </div>
                <div class="progress-wrap"><div class="progress-bar" style="width:${topics.length ? Math.round(passedTopics / topics.length * 100) : 0}%"></div></div>
              </div>` : ''}
          </div>
        </div>
        <div class="topics-grid">
    `;

    topics.forEach((topic, ti) => {
      const isFirstInMs = ti === 0;
      const prevPassed = ti > 0 && unlockedTopics.includes(topics[ti - 1].id);
      const passed = unlockedTopics.includes(topic.id);
      const unlocked = !user || (msUnlocked && (isFirstInMs || prevPassed || passed));

      const statusIcon = passed
        ? `<span class="topic-status status-passed"><i class="fa-solid fa-circle-check"></i> Completed</span>`
        : unlocked
          ? `<span class="topic-status status-unlocked"><i class="fa-solid fa-lock-open"></i> Available</span>`
          : `<span class="topic-status status-locked"><i class="fa-solid fa-lock"></i> Locked</span>`;

      html += `
        <a href="topic.html?slug=${topic.slug}" class="topic-card ${(!unlocked && !passed) && user ? 'locked' : ''} ${passed ? 'topic-card--passed' : ''}">
          <div class="topic-title">${topic.title}</div>
          <div class="topic-desc">${topic.description || ''}</div>
          <div class="topic-meta">
            ${statusIcon}
            <span style="font-size:0.8rem;color:var(--grey);"><i class="fa-regular fa-circle-question"></i> 10 questions</span>
          </div>
        </a>
      `;
    });

    html += '</div>';

    if (topics.length > 0) {
      const allPassed = topics.every(t => unlockedTopics.includes(t.id));
      const msPassed = unlockedMilestones.includes(ms.id);
      html += `
        <div class="milestone-test-banner">
          <div>
            <h4><i class="fa-solid fa-graduation-cap"></i> Milestone ${i + 1} Test</h4>
            <p>25 questions — complete all topics first to unlock</p>
          </div>
          ${user && allPassed && !msPassed
            ? `<a href="topic.html?milestone=${ms.id}" class="btn btn-primary" style="white-space:nowrap;">Take Test</a>`
            : msPassed
              ? `<span style="color:#7dd3b0;font-size:0.9rem;"><i class="fa-solid fa-circle-check"></i> Passed</span>`
              : `<span style="font-size:0.85rem;opacity:0.6;"><i class="fa-solid fa-lock"></i> Locked</span>`
          }
        </div>
      `;
    }

    html += '</section>';
  });

  document.getElementById('curriculum-container').innerHTML = html;

  // Scroll to next unlocked topic
  scrollToNextTopic();
});

function renderProgressSidebar(progress) {
  const section = document.getElementById('progress-section');
  if (!section) return;

  let html;
  if (!progress) {
    html = `
      <p class="text-muted" style="font-size:0.9rem;">Sign in to track your progress across milestones and topics.</p>
      <a href="/?login=1" class="btn btn-primary w-100 mt-3" style="justify-content:center;">Sign In</a>
    `;
  } else {
    const unlocked = (progress.unlocked_topics || []).length;
    const milestones = (progress.unlocked_milestones || []).length;
    html = `
      <div class="progress-stat">
        <div class="progress-stat-label"><span>Topics completed</span><span>${unlocked}</span></div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(unlocked * 5, 100)}%"></div></div>
      </div>
      <div class="progress-stat">
        <div class="progress-stat-label"><span>Milestones unlocked</span><span>${milestones}</span></div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(milestones * 20, 100)}%"></div></div>
      </div>
      <a href="profile.html" class="btn btn-outline w-100 mt-3" style="justify-content:center;font-size:0.9rem;">
        <i class="fa-regular fa-user"></i> View Profile
      </a>
    `;
  }

  section.style.opacity = '0';
  section.style.transition = 'opacity 0.3s ease';
  section.innerHTML = html;
  requestAnimationFrame(() => { section.style.opacity = '1'; });
}


function scrollToNextTopic() {
  // Find the first topic card that is available but not yet completed
  const allCards = document.querySelectorAll('.topic-card');
  let target = null;

  for (const card of allCards) {
    const isLocked = card.classList.contains('locked');
    const isPassed = card.classList.contains('topic-card--passed');
    if (!isLocked && !isPassed) {
      target = card;
      break;
    }
  }

  if (!target) return;

  const fromTest = new URLSearchParams(window.location.search).get('scrollToNext');
  if (fromTest === '1' || document.querySelector('.topic-card--passed')) {
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.outline = '2px solid var(--red)';
      setTimeout(() => target.style.outline = '', 2000);
    }, 400);
  }
}
