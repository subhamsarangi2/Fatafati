$(async function () {
  const user = await requireAdmin();
  if (!user) return;

  updateNavAuth(user);
  await showView('dashboard');

  $(document).on('click', '.sidebar-nav a', async function (e) {
    e.preventDefault();
    $('.sidebar-nav a').removeClass('active');
    $(this).addClass('active');
    await showView($(this).data('view'));
  });
});

async function showView(view) {
  const main = document.getElementById('admin-main');
  main.innerHTML = '<div class="spinner"></div>';

  if (view === 'dashboard') await renderDashboard(main);
  else if (view === 'content') renderImport(main);
  else if (view === 'milestones') await renderMilestones(main);
  else if (view === 'topics') await renderTopics(main);
  else if (view === 'attempts') await renderAttempts(main);
}

async function renderDashboard(el) {
  const [
    { count: users },
    { count: attempts },
    { count: topicsCompleted },
    { count: milestonesCompleted }
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('test_attempts').select('id', { count: 'exact', head: true }),
    supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('passed', true).not('topic_id', 'is', null),
    supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('passed', true).not('milestone_id', 'is', null)
  ]);

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Dashboard</h1>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-number">${users ?? 0}</div>
        <div class="stat-label"><i class="fa-solid fa-users"></i> Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${attempts ?? 0}</div>
        <div class="stat-label"><i class="fa-solid fa-list-check"></i> Test Attempts</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${topicsCompleted ?? 0}</div>
        <div class="stat-label"><i class="fa-solid fa-book"></i> Topics Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${milestonesCompleted ?? 0}</div>
        <div class="stat-label"><i class="fa-solid fa-trophy"></i> Milestones Completed</div>
      </div>
    </div>
  `;
}

function renderImport(el) {
  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Import Content</h1>
    <div class="card" style="max-width:760px;">
      <h3 style="margin-bottom:0.5rem;">Import Topics &amp; Questions</h3>
      <p class="text-muted mb-3" style="font-size:0.9rem;">
        Paste a JSON array of topics with nested questions. See format below.
      </p>
      <div id="import-alert"></div>
      <div class="form-group">
        <label class="form-label">JSON Payload</label>
        <textarea class="form-control json-editor" id="import-json" placeholder='[{"milestone_id":"...","title":"...","slug":"...","description":"...","body_markdown":"...","order_index":1,"questions":[{"question_text":"...","options":["A","B","C","D"],"correct_option":0}]}]'></textarea>
      </div>
      <button class="btn btn-primary" id="import-btn"><i class="fa-solid fa-upload"></i> Import</button>
    </div>
    <div class="card mt-4" style="max-width:760px;background:var(--bg);">
      <h4 style="font-size:0.95rem;margin-bottom:1rem;">Expected JSON format</h4>
      <pre style="font-size:0.8rem;color:var(--grey);overflow-x:auto;white-space:pre-wrap;">[
  {
    "milestone_id": "uuid",
    "title": "Greetings",
    "slug": "greetings",
    "description": "Learn basic English greetings.",
    "body_markdown": "# Greetings\\nIn English...",
    "order_index": 1,
    "questions": [
      {
        "question_text": "How do you say hello?",
        "options": ["Hello", "Goodbye", "Thanks", "Sorry"],
        "correct_option": 0
      }
    ]
  }
]</pre>
    </div>
  `;

  $('#import-btn').on('click', async function () {
    const raw = $('#import-json').val().trim();
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      $('#import-alert').html('<div class="alert alert-error">Invalid JSON — check your syntax.</div>');
      return;
    }
    if (!Array.isArray(payload)) {
      $('#import-alert').html('<div class="alert alert-error">Expected a JSON array.</div>');
      return;
    }

    $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Importing...');

    let topicsInserted = 0;
    let questionsInserted = 0;
    let errors = [];

    for (const item of payload) {
      const { questions: qs, ...topicData } = item;
      const { data: inserted, error: tErr } = await supabase
        .from('topics')
        .insert(topicData)
        .select()
        .single();

      if (tErr) { errors.push(tErr.message); continue; }
      topicsInserted++;

      if (Array.isArray(qs) && qs.length > 0) {
        const qRows = qs.map(q => ({ ...q, topic_id: inserted.id }));
        const { error: qErr } = await supabase.from('questions').insert(qRows);
        if (qErr) errors.push(qErr.message);
        else questionsInserted += qRows.length;
      }
    }

    $(this).prop('disabled', false).html('<i class="fa-solid fa-upload"></i> Import');

    if (errors.length) {
      $('#import-alert').html(`<div class="alert alert-error">Some errors: ${errors.join('; ')}</div>`);
    } else {
      $('#import-alert').html(`<div class="alert alert-success">Imported ${topicsInserted} topic(s) and ${questionsInserted} question(s).</div>`);
      $('#import-json').val('');
    }
  });
}

async function renderMilestones(el) {
  const { data: rows } = await supabase
    .from('milestones')
    .select('*, topics(count)')
    .order('order_index');

  const tableRows = (rows || []).map(ms => `
    <tr>
      <td>${ms.order_index}</td>
      <td style="font-weight:600;color:var(--blue);">${ms.title}</td>
      <td style="color:var(--grey);">${ms.description || '—'}</td>
      <td>${ms.topics?.[0]?.count ?? 0}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--grey);padding:2rem;">No milestones yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Milestones</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Topics</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

async function renderTopics(el) {
  const { data: rows } = await supabase
    .from('topics')
    .select('*, milestones(title)')
    .order('order_index');

  const tableRows = (rows || []).map(t => `
    <tr>
      <td style="font-weight:600;color:var(--blue);">${t.title}</td>
      <td><code style="font-size:0.82rem;">${t.slug}</code></td>
      <td>${t.milestones?.title ?? '—'}</td>
      <td>${t.order_index}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--grey);padding:2rem;">No topics yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Topics</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Slug</th><th>Milestone</th><th>Order</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

async function renderAttempts(el) {
  const { data: rows } = await supabase
    .from('test_attempts')
    .select('*, topics(title), milestones(title), profiles(email)')
    .order('attempted_at', { ascending: false })
    .limit(100);

  const tableRows = (rows || []).map(a => {
    const name = a.topics?.title ?? a.milestones?.title ?? '—';
    const type = a.topic_id ? 'Topic' : 'Milestone';
    const date = new Date(a.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `
      <tr>
        <td style="font-size:0.85rem;color:var(--grey);">${a.profiles?.email ?? a.user_id.slice(0, 8) + '...'}</td>
        <td>${name}</td>
        <td><span class="badge ${type === 'Topic' ? 'badge-user' : 'badge-admin'}">${type}</span></td>
        <td>${a.score}</td>
        <td><span class="badge ${a.passed ? 'badge-pass' : 'badge-fail'}">${a.passed ? 'Pass' : 'Fail'}</span></td>
        <td style="font-size:0.85rem;color:var(--grey);">${date}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:2rem;">No attempts yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Test Attempts</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>User</th><th>Test</th><th>Type</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}
