document.addEventListener('DOMContentLoaded', async function () {
  const user = await requireAuth();
  if (!user) return;

  updateNavAuth(user);

  const progress = await getUserProgress(user.id);
  const milestoneCount = (progress?.unlocked_milestones ?? []).length;
  const topicCount = (progress?.unlocked_topics ?? []).length;
  const initials = user.email?.charAt(0).toUpperCase() ?? '?';

  const levelLabel = milestoneCount === 0 ? 'Beginner' : `Milestone ${milestoneCount}`;

  document.getElementById('profile-card').innerHTML = `
    <div class="avatar">${initials}</div>
    <div class="profile-email">${user.email}</div>
    <div class="milestone-level">
      <div class="level-label">Current Level</div>
      <div class="level-value">${levelLabel}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;text-align:left;">
      <div>
        <div style="font-size:0.82rem;color:var(--grey);margin-bottom:0.4rem;">Topics completed</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(topicCount * 5, 100)}%"></div></div>
        <div style="font-size:0.82rem;color:var(--grey);margin-top:0.3rem;">${topicCount} topics</div>
      </div>
      <div>
        <div style="font-size:0.82rem;color:var(--grey);margin-bottom:0.4rem;">Milestones unlocked</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(milestoneCount * 20, 100)}%"></div></div>
        <div style="font-size:0.82rem;color:var(--grey);margin-top:0.3rem;">${milestoneCount} milestones</div>
      </div>
    </div>
    <a href="learn.html" class="btn btn-primary w-100 mt-4" style="justify-content:center;">
      <i class="fa-solid fa-book-open"></i> Continue Learning
    </a>
    <button onclick="signOut()" class="btn btn-outline w-100 mt-2" style="justify-content:center;">
      <i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
    </button>
  `;

  const { data: attempts, error } = await supabaseClient
    .from('test_attempts')
    .select('*, topics(title), milestones(title)')
    .eq('user_id', user.id)
    .order('attempted_at', { ascending: false })
    .limit(50);

  const container = document.getElementById('attempts-container');

  if (error || !attempts || attempts.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:3rem;">
        <i class="fa-regular fa-circle-question" style="font-size:2.5rem;color:var(--border);margin-bottom:1rem;"></i>
        <p class="text-muted">No test attempts yet. Start a lesson to take your first quiz.</p>
        <a href="learn.html" class="btn btn-primary mt-3">Browse Lessons</a>
      </div>
    `;
    return;
  }

  const rows = attempts.map(a => {
    const name = a.topics?.title ?? a.milestones?.title ?? 'Unknown';
    const type = a.topic_id ? 'Topic Test' : 'Milestone Test';
    const date = new Date(a.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <div class="attempt-row">
        <div>
          <div class="attempt-name">${name}</div>
          <div class="attempt-date">${type} · ${date}</div>
        </div>
        <div class="attempt-right">
          <span class="badge ${a.passed ? 'badge-pass' : 'badge-fail'}">${a.passed ? 'Pass' : 'Fail'}</span>
          <div style="font-size:0.82rem;color:var(--grey);margin-top:0.25rem;">Score: ${a.score}</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="card" style="padding:1.5rem 2.5rem;">${rows}</div>`;
});
