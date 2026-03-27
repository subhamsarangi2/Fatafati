# Repurposing Fatafati for Other Subjects

Fatafati was built as an English learning platform for Bengali speakers, but the underlying architecture is entirely content-agnostic. The learning engine — milestones, topics, lessons, quizzes, progress tracking — has no subject-matter assumptions baked in. This document explains what it takes to repurpose it for any other subject or audience.

---

## What's Already Generic

The following parts of the codebase require zero changes regardless of subject:

- **Learning engine** — the milestone → topic → lesson → quiz → unlock flow works for any structured curriculum
- **Admin panel** — import any JSON curriculum, manage milestones and topics, preview content
- **Quiz system** — multiple choice, scoring, wrong-answer limits, sequential unlocking
- **Auth** — email/password + Google OAuth via Supabase
- **Progress tracking** — per-user topic completion and milestone unlocking
- **PWA + offline support** — service worker, installable app
- **All JavaScript** (`js/`) — no subject-matter logic anywhere
- **All CSS** (`css/`) — purely visual, no content assumptions
- **Supabase schema** — tables are named `milestones`, `topics`, `questions`, `user_progress` — all neutral

---

## What Needs Changing

### 1. UI Copy (~2 hours)
The visible text in the HTML files is currently in Bengali and references English learning. Update these files:

| File | What to change |
|---|---|
| `index.html` | Hero heading, subtext, feature descriptions, CTA text, meta tags, OG tags, page title |
| `learn.html` | Page header text |
| `topic.html` | Breadcrumb labels, quiz UI labels |
| `profile.html` | Section headings |
| `offline.html` | Offline message |
| `privacy.html` | References to "English learning" |
| `terms.html` | References to "English learning", governing law if needed |

### 2. Language & Font
The pages currently use `lang="bn"` and load **Noto Serif Bengali** from Google Fonts.

- Change `<html lang="bn">` to the appropriate language code
- Swap the Google Fonts import in `css/main.css` for a font that suits your audience
- The font import is a single `@import` line at the top of `main.css`

### 3. Branding
- Replace `assets/logo.png` with your own logo
- Replace `assets/og/og-default.jpg` with your OG image
- Update the site name ("Fatafati") in meta tags, footer, and `manifest.json`
- Update the domain in `js/supabase-client.js` (`redirectTo` URLs) and `index.html` (reset password redirect)

### 4. Supabase Project
- Create a new Supabase project (or reuse the schema)
- Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/supabase-client.js`
- Add your domain to the Supabase redirect URL allowlist

### 5. Minor Files
- `README.md` — update description
- `sitemap.xml` — update URLs
- `robots.txt` — update sitemap URL
- `manifest.json` — update app name and description

---

## What You Don't Touch

- Any file in `js/` (except the two Supabase config values)
- `css/main.css` structure (only the font import line)
- `css/admin.css`
- The Supabase schema — it's already generic
- Sound files in `assets/sounds/` — neutral names, reusable

---

## Example Use Cases

The platform structure maps well to any subject with a natural learning progression:

- **Programming** — milestones like "Python Basics", "Data Structures", "OOP"
- **Mathematics** — milestones like "Arithmetic", "Algebra", "Calculus"
- **History** — milestones by era or region
- **Language learning** — any language pair, not just English
- **Professional certifications** — structured exam prep with milestone tests
- **School curriculum** — any subject broken into chapters and topics

---

## Estimated Effort

| Task | Time |
|---|---|
| UI copy + meta tags | 1–2 hours |
| Font + language swap | 15 minutes |
| Branding assets | depends on design |
| Supabase setup | 30 minutes |
| Curriculum import via admin | 30 minutes per milestone |

Total for a full repurpose: **half a day** for a developer familiar with the codebase.
