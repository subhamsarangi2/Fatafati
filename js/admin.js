document.addEventListener('DOMContentLoaded', async function () {
  const user = await requireAdmin();
  if (!user) return;

  updateNavAuth(user);
  await showView('dashboard');

  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', async function (e) {
      e.preventDefault();
      document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
      this.classList.add('active');
      await showView(this.dataset.view);
    });
  });

  document.getElementById('topic-preview-close').addEventListener('click', () => {
    document.getElementById('topic-preview-modal').classList.remove('open');
  });
  document.getElementById('topic-preview-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });
});

async function showView(view) {
  const main = document.getElementById('admin-main');
  main.innerHTML = '<div class="spinner"></div>';

  if (view === 'dashboard') await renderDashboard(main);
  else if (view === 'curriculum') renderCurriculumImport(main);
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
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
    supabaseClient.from('test_attempts').select('id', { count: 'exact', head: true }),
    supabaseClient.from('test_attempts').select('id', { count: 'exact', head: true }).eq('passed', true).not('topic_id', 'is', null),
    supabaseClient.from('test_attempts').select('id', { count: 'exact', head: true }).eq('passed', true).not('milestone_id', 'is', null)
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


function renderCurriculumImport(el) {
  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Import Curriculum</h1>
    <div class="card" style="max-width:760px;">
      <h3 style="margin-bottom:0.5rem;">Import Milestones &amp; Topics</h3>
      <p class="text-muted mb-3" style="font-size:0.9rem;">
        Paste a JSON array of milestones with nested topics. Milestones and topics will be created automatically.
      </p>
      <div id="curriculum-alert"></div>
      <div class="form-group">
        <label class="form-label">JSON Payload</label>
        <textarea class="form-control json-editor" id="curriculum-json" placeholder='[{"milestone_title":"...","milestone_description":"...","topics":[{"title":"...","slug":"...","description":"...","order_index":1}]}]'></textarea>
      </div>
      <button class="btn btn-primary" id="curriculum-btn"><i class="fa-solid fa-upload"></i> Import Curriculum</button>
      <button class="btn btn-outline" id="clear-curriculum-btn" style="color:var(--red);border-color:var(--red);margin-left:0.75rem;"><i class="fa-solid fa-trash"></i> Clear All Curriculum</button>
    </div>
    <div class="card mt-4" style="max-width:760px;background:var(--bg);">
      <h4 style="font-size:0.95rem;margin-bottom:1rem;">Expected JSON format</h4>
      <pre style="font-size:0.8rem;color:var(--grey);overflow-x:auto;white-space:pre-wrap;">[
  {
    "milestone_title": "Milestone 1: The Foundations",
    "milestone_description": "Understanding the building blocks.",
    "topics": [
      {
        "title": "The Alphabet",
        "slug": "alphabet-phonetics",
        "description": "Master the A-Z and sounds.",
        "order_index": 1
      }
    ]
  }
]</pre>
    </div>
  `;

  document.getElementById('curriculum-btn').addEventListener('click', async function () {
    const raw = document.getElementById('curriculum-json').value.trim();
    if (!raw) return;

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      document.getElementById('curriculum-alert').innerHTML = '<div class="alert alert-error">Invalid JSON — check your syntax.</div>';
      return;
    }
    if (!Array.isArray(payload)) {
      document.getElementById('curriculum-alert').innerHTML = '<div class="alert alert-error">Expected a JSON array.</div>';
      return;
    }

    this.disabled = true;
    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

    let milestonesInserted = 0, milestonesUpdated = 0;
    let topicsInserted = 0, topicsUpdated = 0;
    const errors = [];

    const { data: existing } = await supabaseClient.from('milestones').select('order_index').order('order_index', { ascending: false }).limit(1);
    let msOrder = (existing?.[0]?.order_index ?? 0) + 1;

    for (const item of payload) {
      // check if milestone with same title exists
      const { data: existingMs } = await supabaseClient
        .from('milestones')
        .select('id, order_index')
        .eq('title', item.milestone_title)
        .maybeSingle();

      let ms;
      if (existingMs) {
        const { data: updated, error: msErr } = await supabaseClient
          .from('milestones')
          .update({ description: item.milestone_description })
          .eq('id', existingMs.id)
          .select()
          .single();
        if (msErr) { errors.push(`Milestone "${item.milestone_title}": ${msErr.message}`); continue; }
        ms = updated;
        milestonesUpdated++;
      } else {
        const { data: inserted, error: msErr } = await supabaseClient
          .from('milestones')
          .insert({ title: item.milestone_title, description: item.milestone_description, order_index: msOrder })
          .select()
          .single();
        if (msErr) { errors.push(`Milestone "${item.milestone_title}": ${msErr.message}`); msOrder++; continue; }
        ms = inserted;
        milestonesInserted++;
        msOrder++;
      }

      if (!Array.isArray(item.topics) || item.topics.length === 0) continue;

      for (const t of item.topics) {
        const { data: existingTopic } = await supabaseClient
          .from('topics')
          .select('id')
          .eq('slug', t.slug)
          .maybeSingle();

        if (existingTopic) {
          const { error: tErr } = await supabaseClient
            .from('topics')
            .update({ title: t.title, description: t.description, order_index: t.order_index, milestone_id: ms.id })
            .eq('id', existingTopic.id);
          if (tErr) errors.push(`Topic "${t.slug}": ${tErr.message}`);
          else topicsUpdated++;
        } else {
          const { error: tErr } = await supabaseClient
            .from('topics')
            .insert({ ...t, milestone_id: ms.id });
          if (tErr) errors.push(`Topic "${t.slug}": ${tErr.message}`);
          else topicsInserted++;
        }
      }
    }

    this.disabled = false;
    this.innerHTML = '<i class="fa-solid fa-upload"></i> Import Curriculum';

    if (errors.length) {
      document.getElementById('curriculum-alert').innerHTML = `<div class="alert alert-error">${errors.join('<br>')}</div>`;
    } else {
      const parts = [];
      if (milestonesInserted) parts.push(`${milestonesInserted} milestone(s) created`);
      if (milestonesUpdated) parts.push(`${milestonesUpdated} milestone(s) updated`);
      if (topicsInserted) parts.push(`${topicsInserted} topic(s) created`);
      if (topicsUpdated) parts.push(`${topicsUpdated} topic(s) updated`);
      document.getElementById('curriculum-alert').innerHTML = `<div class="alert alert-success">${parts.join(', ') || 'Nothing to change'}.</div>`;
      document.getElementById('curriculum-json').value = '';
    }
  });

  document.getElementById('clear-curriculum-btn').addEventListener('click', async function () {
    if (!confirm('This will permanently delete ALL milestones, topics, questions, and user progress. Are you sure?')) return;
    if (!confirm('Second confirmation: this cannot be undone. Delete everything?')) return;

    this.disabled = true;
    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';

    const errors = [];
    const tables = ['questions', 'test_attempts', 'user_progress', 'topics', 'milestones'];
    for (const table of tables) {
      const { error } = await supabaseClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) errors.push(`${table}: ${error.message}`);
    }

    this.disabled = false;
    this.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Curriculum';

    document.getElementById('curriculum-alert').innerHTML = errors.length
      ? `<div class="alert alert-error">${errors.join('<br>')}</div>`
      : '<div class="alert alert-success">All curriculum data cleared.</div>';
  });
}

async function renderMilestones(el) {
  const { data: rows } = await supabaseClient
    .from('milestones')
    .select('*, topics(count)')
    .order('order_index');

  const tableRows = (rows || []).map(ms => `
    <tr>
      <td>${ms.order_index}</td>
      <td style="font-weight:600;color:var(--blue);">${ms.title}</td>
      <td style="color:var(--grey);">${ms.description || '—'}</td>
      <td>${ms.topics?.[0]?.count ?? 0}</td>
      <td style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm import-lesson-btn" style="font-size:0.8rem;padding:0.3rem 0.75rem;"
          data-id="${ms.id}" data-type="milestone">
          <i class="fa-solid fa-upload"></i> Import Lessons
        </button>
        <button class="btn btn-outline btn-sm copy-prompt-btn" style="font-size:0.8rem;padding:0.3rem 0.75rem;"
          data-type="milestone" data-title="${ms.title.replace(/"/g,'&quot;')}" data-description="${(ms.description||'').replace(/"/g,'&quot;')}">
          <i class="fa-regular fa-copy"></i> Copy Prompt
        </button>
      </td>
    </tr>
    <tr class="import-panel-row" id="panel-milestone-${ms.id}" style="display:none;">
      <td colspan="5" style="padding:0;">${buildImportPanel('milestone', ms.id)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--grey);padding:2rem;">No milestones yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Milestones</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Topics</th><th></th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  bindImportPanels(el);
}

async function renderTopics(el) {
  const { data: rows } = await supabaseClient
    .from('topics')
    .select('*, milestones(title)')
    .order('order_index');

  const tableRows = (rows || []).map(t => `
    <tr>
      <td>
        <button class="topic-preview-btn" style="background:none;border:none;cursor:pointer;font-weight:600;color:var(--blue);font-family:inherit;font-size:inherit;text-align:left;padding:0;text-decoration:underline;text-underline-offset:3px;"
          data-id="${t.id}" data-title="${t.title.replace(/"/g,'&quot;')}">
          ${t.title}
        </button>
      </td>
      <td><code style="font-size:0.82rem;">${t.slug}</code></td>
      <td>${t.milestones?.title ?? '—'}</td>
      <td>${t.order_index}</td>
      <td style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm import-lesson-btn" style="font-size:0.8rem;padding:0.3rem 0.75rem;"
          data-id="${t.id}" data-type="topic">
          <i class="fa-solid fa-upload"></i> Import Lessons
        </button>
        <button class="btn btn-outline btn-sm copy-prompt-btn" style="font-size:0.8rem;padding:0.3rem 0.75rem;"
          data-type="topic" data-title="${t.title.replace(/"/g,'&quot;')}" data-description="${(t.description||'').replace(/"/g,'&quot;')}" data-milestone="${(t.milestones?.title||'').replace(/"/g,'&quot;')}">
          <i class="fa-regular fa-copy"></i> Copy Prompt
        </button>
      </td>
    </tr>
    <tr class="import-panel-row" id="panel-topic-${t.id}" style="display:none;">
      <td colspan="5" style="padding:0;">${buildImportPanel('topic', t.id)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--grey);padding:2rem;">No topics yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Topics</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Slug</th><th>Milestone</th><th>Order</th><th></th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  el.querySelectorAll('.topic-preview-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, title } = btn.dataset;
      const modal = document.getElementById('topic-preview-modal');
      const body = document.getElementById('topic-preview-body');

      body.innerHTML = '<div class="spinner"></div>';
      modal.classList.add('open');

      const { data, error } = await supabaseClient.from('topics').select('body_markdown, questions(count)').eq('id', id).single();

      if (error || !data?.body_markdown) {
        body.innerHTML = `
          <div style="text-align:center;padding:2rem 0;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:2.5rem;color:var(--grey);opacity:0.4;margin-bottom:1rem;display:block;"></i>
            <p style="color:var(--grey);">No lesson content yet for <strong>${title}</strong>.</p>
            <p class="text-muted" style="margin-top:0.5rem;">Close this and use "Import Lessons" to add content.</p>
          </div>`;
        return;
      }

      body.innerHTML = `
        <h2 style="font-size:1.4rem;margin-bottom:1.5rem;padding-bottom:0.75rem;border-bottom:2px solid var(--border);">${title}</h2>
        <div class="lesson-body" style="font-size:0.95rem;line-height:1.75;">${marked.parse(data.body_markdown)}</div>
      `;
    });
  });

  bindImportPanels(el);
}

function buildImportPanel(type, id) {
  const placeholder = type === 'topic'
    ? '{"body_markdown":"# Lesson Title\\n\\nLesson content...","questions":[{"question_text":"...","options":["A","B","C","D"],"correct_option":0}]}'
    : '{"questions":[{"question_text":"...","options":["A","B","C","D"],"correct_option":0}]}';

  return `
    <div style="background:var(--bg);border-top:1px solid var(--border);padding:1.5rem 2rem;">
      <div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--grey);margin-bottom:0.75rem;">
        ${type === 'topic' ? 'body_markdown + questions' : 'milestone questions only'}
      </div>
      <div id="alert-${type}-${id}" style="margin-bottom:0.75rem;"></div>
      <textarea class="form-control" id="json-${type}-${id}" rows="8"
        style="font-family:monospace;font-size:0.82rem;margin-bottom:0.75rem;"
        placeholder='${placeholder}'></textarea>
      <div style="display:flex;gap:0.75rem;">
        <button class="btn btn-primary do-import-btn" style="font-size:0.85rem;" data-id="${id}" data-type="${type}">
          <i class="fa-solid fa-upload"></i> Save
        </button>
        <button class="btn btn-outline close-panel-btn" style="font-size:0.85rem;" data-id="${id}" data-type="${type}">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function bindImportPanels(el) {
  el.querySelectorAll('.copy-prompt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { type, title, description, milestone } = btn.dataset;
      let prompt;

      if (type === 'topic') {
        prompt = `Generate a lesson for the following English learning topic and return ONLY valid JSON in this exact format, no explanation:

Topic: "${title}"
Milestone: "${milestone}"
Description: "${description}"

{
  "body_markdown": "[Full lesson content in markdown. Start directly with the content — no top-level heading. Include explanation, examples, and practice sentences.]",
  "questions": [
    {
      "question_text": "[Question text — use exactly this field name]",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0
    }
  ]
}

Requirements:
- Language: write in a natural mix of simple English and standard Bengali (neutral Bengali, not region-specific). Explain English concepts in Bengali where it aids understanding, and use English for the actual examples and terms being taught.
- body_markdown: thorough lesson in markdown (headings, examples, tables if useful)
- questions: exactly 10 multiple-choice questions testing the lesson content
- Each question MUST use the field name "question_text" (not "question", not "text", not anything else)
- correct_option: zero-based index of the correct answer`;
      } else {
        prompt = `Generate milestone test questions for the following English learning milestone and return ONLY valid JSON in this exact format, no explanation:

Milestone: "${title}"
Description: "${description}"

{
  "questions": [
    {
      "question_text": "[Question text — use exactly this field name]",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0
    }
  ]
}

Requirements:
- Language: write questions in a natural mix of simple English and standard Bengali (neutral Bengali, not region-specific)
- questions: exactly 25 multiple-choice questions covering all topics in this milestone
- Each question MUST use the field name "question_text" (not "question", not "text", not anything else)
- correct_option: zero-based index of the correct answer
- Questions should vary in difficulty and cover the full breadth of the milestone`;
      }

      navigator.clipboard.writeText(prompt).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });
  });

  el.querySelectorAll('.import-lesson-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, type } = btn.dataset;
      const panel = document.getElementById(`panel-${type}-${id}`);
      const isOpen = panel.style.display !== 'none';
      el.querySelectorAll('.import-panel-row').forEach(r => r.style.display = 'none');
      if (!isOpen) panel.style.display = 'table-row';
    });
  });

  el.querySelectorAll('.close-panel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, type } = btn.dataset;
      document.getElementById(`panel-${type}-${id}`).style.display = 'none';
    });
  });

  el.querySelectorAll('.do-import-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, type } = btn.dataset;
      const alertEl = document.getElementById(`alert-${type}-${id}`);
      const raw = document.getElementById(`json-${type}-${id}`).value.trim();
      if (!raw) return;

      let payload;
      try { payload = JSON.parse(raw); }
      catch { alertEl.innerHTML = '<div class="alert alert-error">Invalid JSON.</div>'; return; }

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

      const errors = [];

      if (type === 'topic') {
        if (payload.body_markdown !== undefined) {
          const { error } = await supabaseClient.from('topics').update({ body_markdown: payload.body_markdown }).eq('id', id);
          if (error) errors.push('body_markdown: ' + error.message);
        }
        if (Array.isArray(payload.questions) && payload.questions.length > 0) {
          await supabaseClient.from('questions').delete().eq('topic_id', id);
          const { error } = await supabaseClient.from('questions').insert(payload.questions.map(q => ({ ...q, topic_id: id })));
          if (error) errors.push('questions: ' + error.message);
        }
      } else {
        if (Array.isArray(payload.questions) && payload.questions.length > 0) {
          await supabaseClient.from('questions').delete().eq('milestone_id', id);
          const { error } = await supabaseClient.from('questions').insert(payload.questions.map(q => ({ ...q, milestone_id: id })));
          if (error) errors.push('questions: ' + error.message);
        }
      }

      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload"></i> Save';
      alertEl.innerHTML = errors.length
        ? `<div class="alert alert-error">${errors.join('<br>')}</div>`
        : '<div class="alert alert-success">Saved successfully.</div>';
    });
  });
}

async function renderAttempts(el) {
  const { data: rows } = await supabaseClient
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
