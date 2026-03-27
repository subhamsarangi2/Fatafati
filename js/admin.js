const INVALIDATE_URL = 'https://hqbspprcvkoopufningr.supabase.co/functions/v1/invalidate-cache';

async function invalidateCurriculumCache() {
  try {
    const session = await getSession();
    await fetch(INVALIDATE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` }
    });
    // Also clear localStorage cache on this device
    localStorage.removeItem('fatafati_curriculum');
  } catch (e) {
    console.warn('Cache invalidation failed (non-critical):', e);
  }
}

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
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-primary" id="curriculum-btn"><i class="fa-solid fa-upload"></i> Import Curriculum</button>
        <button class="btn btn-outline" id="load-existing-btn"><i class="fa-solid fa-download"></i> Load Existing</button>
        <button class="btn btn-outline" id="clear-curriculum-btn" style="color:var(--red);border-color:var(--red);"><i class="fa-solid fa-trash"></i> Clear All</button>
      </div>
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
      await invalidateCurriculumCache();
    }
  });

  document.getElementById('load-existing-btn').addEventListener('click', async function () {
    this.disabled = true;
    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    const { data: milestones } = await supabaseClient
      .from('milestones')
      .select('*, topics(title, slug, description, order_index)')
      .order('order_index');

    this.disabled = false;
    this.innerHTML = '<i class="fa-solid fa-download"></i> Load Existing';

    if (!milestones?.length) {
      document.getElementById('curriculum-alert').innerHTML = '<div class="alert alert-info">No existing curriculum found.</div>';
      return;
    }

    const payload = milestones.map(ms => ({
      milestone_title: ms.title,
      milestone_description: ms.description || '',
      topics: (ms.topics || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(t => ({
          title: t.title,
          slug: t.slug,
          description: t.description || '',
          order_index: t.order_index
        }))
    }));

    document.getElementById('curriculum-json').value = JSON.stringify(payload, null, 2);
    document.getElementById('curriculum-alert').innerHTML = '<div class="alert alert-success">Existing curriculum loaded. Edit and re-import to update.</div>';
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
    await invalidateCurriculumCache();
  });
}

async function renderMilestones(el) {
  const { data: rows } = await supabaseClient
    .from('milestones')
    .select('*, topics(count), questions(count)')
    .order('order_index');

  const tableRows = (rows || []).map(ms => {
    const qCount = ms.questions?.[0]?.count ?? 0;
    const contentBadge = qCount > 0
      ? `<span style="color:#16a34a;font-size:0.82rem;font-weight:600;"><i class="fa-solid fa-circle-check"></i> ${qCount}q</span>`
      : `<span style="color:var(--grey);font-size:0.82rem;"><i class="fa-regular fa-circle"></i> Empty</span>`;
    return `
    <tr>
      <td>${ms.order_index}</td>
      <td>
        <button class="ms-preview-btn" style="background:none;border:none;cursor:pointer;font-weight:600;color:var(--blue);font-family:inherit;font-size:inherit;text-align:left;padding:0;text-decoration:underline;text-underline-offset:3px;"
          data-id="${ms.id}" data-title="${ms.title.replace(/"/g,'&quot;')}">
          ${ms.title}
        </button>
      </td>
      <td style="color:var(--grey);">${ms.description || '—'}</td>
      <td>${ms.topics?.[0]?.count ?? 0}</td>
      <td>${contentBadge}</td>
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
      <td colspan="6" style="padding:0;">${buildImportPanel('milestone', ms.id)}</td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:2rem;">No milestones yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Milestones</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Topics</th><th>Questions</th><th></th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  el.querySelectorAll('.ms-preview-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, title } = btn.dataset;
      const modal = document.getElementById('topic-preview-modal');
      const body = document.getElementById('topic-preview-body');

      body.innerHTML = '<div class="spinner"></div>';
      modal.classList.add('open');

      const { data: questions } = await supabaseClient
        .from('questions')
        .select('*')
        .eq('milestone_id', id);

      const qs = questions || [];

      const questionsHtml = qs.length
        ? qs.map((q, i) => {
            const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]');
            return `
              <div style="margin-bottom:2rem;padding-bottom:2rem;border-bottom:1px solid var(--border);">
                <div style="font-weight:600;font-size:1rem;color:var(--blue);margin-bottom:1rem;line-height:1.5;">${i + 1}. ${q.question_text}</div>
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                  ${opts.map((opt, oi) => `
                    <div style="padding:0.7rem 1rem;border-radius:6px;font-size:0.92rem;
                      border:2px solid ${oi === q.correct_option ? '#16a34a' : 'var(--border)'};
                      background:${oi === q.correct_option ? '#f0fdf4' : 'transparent'};
                      color:${oi === q.correct_option ? '#166534' : 'var(--grey)'};">
                      ${oi === q.correct_option ? '✓ ' : ''}${opt}
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')
        : `<p style="color:var(--grey);">No questions added to this milestone test yet.</p>`;

      body.innerHTML = `
        <h2 style="font-size:1.75rem;margin-bottom:0.5rem;">${title}</h2>
        <p style="color:var(--grey);font-size:0.9rem;margin-bottom:2.5rem;">Milestone Test — ${qs.length} question${qs.length !== 1 ? 's' : ''}</p>
        <div style="max-width:680px;">${questionsHtml}</div>
      `;
    });
  });

  bindImportPanels(el);
}

async function renderTopics(el) {
  const { data: rows } = await supabaseClient
    .from('topics')
    .select('*, milestones(title), questions(count)')
    .order('order_index');

  const tableRows = (rows || []).map(t => {
    const qCount = t.questions?.[0]?.count ?? 0;
    const hasLesson = !!t.body_markdown;
    const contentBadge = (hasLesson && qCount > 0)
      ? `<span style="color:#16a34a;font-size:0.82rem;font-weight:600;"><i class="fa-solid fa-circle-check"></i> Lesson + ${qCount}q</span>`
      : hasLesson
        ? `<span style="color:#ca8a04;font-size:0.82rem;font-weight:600;"><i class="fa-solid fa-circle-half-stroke"></i> Lesson only</span>`
        : qCount > 0
          ? `<span style="color:#ca8a04;font-size:0.82rem;font-weight:600;"><i class="fa-solid fa-circle-half-stroke"></i> ${qCount}q only</span>`
          : `<span style="color:var(--grey);font-size:0.82rem;"><i class="fa-regular fa-circle"></i> Empty</span>`;
    return `
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
      <td>${contentBadge}</td>
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
      <td colspan="6" style="padding:0;">${buildImportPanel('topic', t.id)}</td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:2rem;">No topics yet.</td></tr>';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Topics</h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Title</th><th>Slug</th><th>Milestone</th><th>Order</th><th>Content</th><th></th></tr></thead>
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

      const { data, error } = await supabaseClient
        .from('topics')
        .select('*, milestones(title), questions(*)')
        .eq('id', id)
        .single();

      if (error || !data) {
        body.innerHTML = `<div style="text-align:center;padding:2rem 0;color:var(--grey);">Failed to load topic.</div>`;
        return;
      }

      const lessonHtml = data.body_markdown
        ? marked.parse(data.body_markdown)
        : `<p style="color:var(--grey);">No lesson content yet. Use "Import Lessons" to add content.</p>`;

      const questions = (data.questions || []).sort((a, b) => a.order_index - b.order_index);
      const questionsHtml = questions.length
        ? questions.map((q, i) => {
            const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]');
            return `
              <div style="margin-bottom:1.75rem;padding-bottom:1.75rem;border-bottom:1px solid var(--border);">
                <div style="font-weight:600;font-size:0.95rem;color:var(--blue);margin-bottom:0.75rem;">${i + 1}. ${q.question_text}</div>
                <div style="display:flex;flex-direction:column;gap:0.4rem;">
                  ${opts.map((opt, oi) => `
                    <div style="padding:0.6rem 0.9rem;border-radius:6px;font-size:0.88rem;
                      border:2px solid ${oi === q.correct_option ? '#16a34a' : 'var(--border)'};
                      background:${oi === q.correct_option ? '#f0fdf4' : 'transparent'};
                      color:${oi === q.correct_option ? '#166534' : 'var(--grey)'};">
                      ${oi === q.correct_option ? '✓ ' : ''}${opt}
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')
        : `<p style="color:var(--grey);font-size:0.9rem;">No questions added yet.</p>`;

      body.innerHTML = `
        <style>
          #topic-preview-body h1,
          #topic-preview-body h2,
          #topic-preview-body h3 { margin: 2.5rem 0 1rem; line-height: 1.35; }
          #topic-preview-body p { margin-bottom: 1.4rem; }
          #topic-preview-body ul,
          #topic-preview-body ol { padding-left: 2rem; margin-bottom: 1.4rem; }
          #topic-preview-body li { margin-bottom: 0.5rem; line-height: 1.7; }
          #topic-preview-body strong { color: var(--blue); }
          #topic-preview-body em { color: var(--red); font-style: italic; }
          #topic-preview-body code { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.15em 0.45em; font-family: monospace; font-size: 0.88em; }
          #topic-preview-body blockquote { border-left: 4px solid var(--border); padding-left: 1.25rem; color: var(--grey); margin: 1.5rem 0; }
          #topic-preview-body table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
          #topic-preview-body th, #topic-preview-body td { border: 1px solid var(--border); padding: 0.6rem 0.9rem; font-size: 0.92rem; }
          #topic-preview-body th { background: var(--bg); font-weight: 700; }
        </style>
        <div style="max-width:680px;margin:0 auto;">
          <div style="font-size:0.78rem;color:var(--grey);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:0.5rem;">${data.milestones?.title ?? ''}</div>
          <h2 style="font-size:1.75rem;margin-bottom:2rem;">${data.title}</h2>
          ${data.image_url ? `<img src="${data.image_url}" alt="${data.title}" style="width:100%;max-height:260px;object-fit:cover;border-radius:var(--radius);margin-bottom:2rem;" />` : ''}
          <div style="font-size:1rem;line-height:2;margin-bottom:3rem;">${lessonHtml}</div>

          <div style="border-top:2px solid var(--border);padding-top:2rem;">
            <div style="font-size:0.78rem;color:var(--grey);text-transform:uppercase;letter-spacing:0.07em;font-weight:700;margin-bottom:1.75rem;">
              Quiz — ${questions.length} question${questions.length !== 1 ? 's' : ''}
            </div>
            ${questionsHtml}
          </div>
        </div>
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
        prompt = `Generate an intensive, deep-dive lesson for the following English learning topic. Return ONLY valid JSON in a code block in this exact format, no explanation:
Topic: "{title}"
Milestone: "{milestone}"
Description: "${description}"
{
"body_markdown": "[Deep-dive lesson content]",
"questions": [
{
"question_text": "[Question text]",
"options": ["Option A", "Option B", "Option C", "Option D"],
"correct_option": 0
}
]
}
Content Requirements:
 * The "Ladder" Approach: The body_markdown must follow a strict progression:
   * Phase 1 (The Foundation): Clear definitions and basic usage rules.
   * Phase 2 (The Mechanics): Intermediate syntax, common sentence patterns, and formal vs. informal usage.
   * Phase 3 (The Mastery): Advanced nuances, rare exceptions, idiomatic expressions, and sophisticated "native-level" tips that go beyond textbook grammar.
 * Language Mix: Use a sophisticated blend of standard Bengali and English. Explain the logic and philosophy behind the grammar in Bengali, but provide complex, high-level examples in English.
 * Rich Formatting: Use markdown tables for comparisons, bold text for emphasis, and blockquotes for "Pro-Tips" or "Common Pitfalls."
Question Requirements:
 * Quantity: Exactly 10 multiple-choice questions.
 * Difficulty Curve: * Questions 1-3: Intermediate (Testing application of rules).
   * Questions 4-7: Hard (Testing context, nuances, and "trick" scenarios).
   * Questions 8-10: Super Hard (Testing advanced synthesis, rare exceptions, or distinguishing between two "technically correct" but contextually different options).
 * No PhD Required: Ensure that while the questions are difficult, the logic to solve them is fully explained within the body_markdown.
 * Strict Schema: Use the field name question_text and a zero-based index for correct_option.`;
      } else {
        prompt = `Generate a comprehensive Milestone Certification Exam for the following English learning milestone. Return ONLY valid JSON in a code block in this exact format, no explanation:
Milestone: "{title}"
Description: "{description}"
{
"questions": [
{
"question_text": "[Scenario-based or High-level Question]",
"options": ["Option A", "Option B", "Option C", "Option D"],
"correct_option": 0
}
]
}
Exam Specifications:
 * Quantity: Exactly 25 multiple-choice questions.
 * Question Distribution (The Difficulty Pyramid):
   * Questions 1-8 (Intermediate): Focus on correct sentence construction and identifying grammar rules in standard contexts.
   * Questions 9-17 (Hard): Focus on "Best Fit" scenarios. Use Bengali to set up a specific social or professional context (e.g., "In a formal email to a boss...") and ask for the most appropriate English response.
   * Questions 18-25 (Expert/Super Hard): Focus on nuance, subtle differences between synonyms, rare exceptions, and correcting complex errors that "sound correct" to a beginner but are technically flawed.
 * Variety of Assessment: * Include Error Detection (Which part of this sentence is wrong?).
   * Include Contextual Logic (Which word changes the tone of this sentence?).
   * Include Idiomatic Application (Using phrases in the correct cultural context).
 * Linguistic Style: Use a natural, professional mix of Bengali and English. The Bengali should provide clear context and instruction, while the English options should be challenging and non-obvious.
 * No Ph.D. Required: Ensure every "Super Hard" question can be solved using high-level logic and the core concepts of the Milestone description.
Technical Constraints:
 * Each question MUST use the field name question_text.
 * correct_option: Zero-based index (0, 1, 2, or 3).
 * Ensure distractor options (the wrong answers) are plausible and not obviously "silly."`;
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
      if (!errors.length) await invalidateCurriculumCache();
    });
  });
}

async function renderAttempts(el, page = 0) {
  const PAGE_SIZE = 10;
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rows, error, count } = await supabaseClient
    .from('test_attempts')
    .select('*, topics(title), milestones(title)', { count: 'exact' })
    .order('attempted_at', { ascending: false })
    .range(from, to);

  if (error) {
    el.innerHTML = `<div class="alert alert-error">Failed to load attempts: ${error.message}</div>`;
    return;
  }

  const userIds = [...new Set((rows || []).map(r => r.user_id))];
  let emailMap = {};
  if (userIds.length) {
    const { data: profiles } = await supabaseClient
      .from('profiles').select('id, email').in('id', userIds);
    (profiles || []).forEach(p => { emailMap[p.id] = p.email; });
  }

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  const tableRows = (rows || []).map(a => {
    const name = a.topics?.title ?? a.milestones?.title ?? '—';
    const type = a.topic_id ? 'Topic' : 'Milestone';
    const date = new Date(a.attempted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const email = emailMap[a.user_id] ?? a.user_id.slice(0, 8) + '...';
    return `<tr>
      <td style="font-size:0.85rem;color:var(--grey);">${email}</td>
      <td>${name}</td>
      <td><span class="badge ${type === 'Topic' ? 'badge-user' : 'badge-admin'}">${type}</span></td>
      <td>${a.score}</td>
      <td><span class="badge ${a.passed ? 'badge-pass' : 'badge-fail'}">${a.passed ? 'Pass' : 'Fail'}</span></td>
      <td style="font-size:0.85rem;color:var(--grey);">${date}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--grey);padding:2rem;">No attempts yet.</td></tr>';

  const pagination = totalPages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1.25rem;font-size:0.9rem;">
      <button class="btn btn-outline" id="pg-prev" ${page === 0 ? 'disabled' : ''} style="padding:0.4rem 1rem;">← Prev</button>
      <span style="color:var(--grey);">Page ${page + 1} of ${totalPages}</span>
      <button class="btn btn-outline" id="pg-next" ${page >= totalPages - 1 ? 'disabled' : ''} style="padding:0.4rem 1rem;">Next →</button>
    </div>` : '';

  el.innerHTML = `
    <h1 class="admin-section-title" style="font-size:1.8rem;border:none;padding:0;margin-bottom:2rem;">Test Attempts <span style="font-size:1rem;color:var(--grey);font-weight:400;">(${count ?? 0} total)</span></h1>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>User</th><th>Test</th><th>Type</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${pagination}
    </div>
  `;

  document.getElementById('pg-prev')?.addEventListener('click', () => renderAttempts(el, page - 1));
  document.getElementById('pg-next')?.addEventListener('click', () => renderAttempts(el, page + 1));
}
