# Social Media Automation

Post to **Instagram, Facebook, Mastodon, and LinkedIn** from a single dashboard. Create posts with images or videos, schedule them, and publish to multiple platforms at once.

## Two Interfaces

### Web App (Recommended)

A Next.js full-stack web app with a form-based UI for managing and publishing posts.

**Features:**
- Create posts with rich text editor, images, and videos
- Publish to multiple platforms simultaneously
- Schedule posts with automatic cron-based publishing
- Connect/disconnect social media accounts from Settings
- Extend Facebook/Instagram tokens to long-lived from the UI
- Password-gated access (single user)
- Auto-refreshing dashboard
- Vercel deployment ready

### Python CLI (Legacy)

A command-line tool that reads posts from an Excel spreadsheet and publishes them.

---

## Web App Setup

### 1. Install dependencies

```bash
cd web
npm install
```

### 2. Configure credentials

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

```env
# Login
AUTH_USERNAME=admin
AUTH_PASSWORD=your_password

# Mastodon
MASTODON_ACCESS_TOKEN=
MASTODON_API_BASE_URL=https://mastodon.social

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# Facebook
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=

# LinkedIn
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_ORGANIZATION_ID=

SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in, and start creating posts.

### 4. Scheduled Posts

Posts with a schedule time and "Ready" checked are auto-published by the cron endpoint.

**Locally:** Visit `http://localhost:3000/api/cron` or set up a crontab:
```bash
*/5 * * * * curl -s http://localhost:3000/api/cron > /dev/null
```

**On Vercel:** Cron runs automatically every 5 minutes (configured in `vercel.json`).

### 5. Token Management

Facebook and Instagram tokens expire. To extend them:

1. Paste a fresh token from Graph API Explorer into Settings
2. Click **"Extend Token"** — Facebook becomes permanent, Instagram extends to 60 days

Requires `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in `.env.local`.

### 6. Deploy to Vercel

```bash
cd web
npx vercel
```

Set all environment variables in the Vercel dashboard.

---

## Python CLI Setup

### 1. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Configure credentials

```bash
cp .env.example .env
# Fill in your tokens
```

### 3. Run

```bash
# Preview what will be posted
python -m src.main preview

# Post to all platforms
python -m src.main post

# Post to specific platforms
python -m src.main post --platforms instagram facebook

# Continuous scheduler
python -m src.main schedule
```

### Spreadsheet Guide

Open `posts_template.xlsx`. Each row is one post.

| Column | Required | Description |
|---|---|---|
| **Title** | Yes | Short headline |
| **Content** | Yes | Main body text |
| **Image** | No | Public image URL |
| **Scheduled At** | No | `YYYY-MM-DD HH:MM` or blank for immediate |
| **Ready** | Yes | `YES` to publish |
| **Platform** | No | `instagram`, `facebook`, `mastodon`, `linkedin`, or blank for all |
| **Posted** | Auto | Set automatically after posting |

---

## Platform Setup

### Instagram

Requires a **Business/Creator account** linked to a **Facebook Page**.

1. [developers.facebook.com](https://developers.facebook.com) > Create App > "Other"
2. Add Instagram Graph API, grant `instagram_basic`, `instagram_content_publish`
3. Graph API Explorer > Generate User Access Token
4. Get your account ID: `GET /me/accounts?fields=id,name,instagram_business_account`

### Facebook

1. Same app as Instagram
2. Grant `pages_manage_posts`, `pages_show_list`
3. Select "Get Page Access Token" in Graph API Explorer
4. Copy your Page ID from `/me/accounts`

### Mastodon

1. Preferences > Development > New Application
2. Grant `read write` scopes
3. Copy the Access Token

### LinkedIn

1. [linkedin.com/developers](https://www.linkedin.com/developers/) > Create App
2. Request "Share on LinkedIn" product
3. Complete OAuth2 flow for `w_member_social` scope
4. For org pages: also get `w_organization_social` and Organization ID

---

## Project Structure

```
web/                         Next.js web app
  src/
    app/
      page.tsx               Dashboard (post list + form)
      settings/page.tsx      Platform token management
      login/page.tsx         Login page
      api/
        posts/               CRUD + publish endpoints
        cron/                Scheduled post publisher
        settings/            Settings + token extension
        platforms/            Connected platform status
    lib/
      platforms/             Platform posting modules
      posts.ts               Post CRUD (JSON file storage)
      settings.ts            Settings management
      auth.ts                Session auth
    middleware.ts             Auth guard
  data/                      Posts and settings (gitignored)
  vercel.json                Vercel cron config

src/                         Python CLI (legacy)
  main.py                    CLI entrypoint
  platforms/                 Platform posting modules
  utils/                     Spreadsheet reader, AI rewriter
posts_template.xlsx          Spreadsheet for CLI usage
```
