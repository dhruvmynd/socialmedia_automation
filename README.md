# Social Media Automation

Post to **Instagram, Facebook, Mastodon, and LinkedIn** from a single dashboard. Create posts with images or videos, schedule them, and publish to multiple platforms at once.

## Features

- Create posts with text, images, videos, and Instagram carousels
- Publish to multiple platforms simultaneously
- Schedule posts with automatic cron-based publishing (every 5 minutes)
- Connect/disconnect social media accounts from Settings page
- Extend Facebook/Instagram tokens to long-lived from the UI
- Google Sheets sync (push/pull posts)
- Password-gated access (single user)
- Auto-refreshing dashboard (every 15 seconds)
- Vercel deployment ready with built-in cron

---

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Platform Token Setup](#platform-token-setup)
  - [Facebook](#facebook-setup)
  - [Instagram](#instagram-setup)
  - [Mastodon](#mastodon-setup)
  - [LinkedIn](#linkedin-setup)
- [Google Sheets Integration](#google-sheets-integration)
- [Scheduling Posts](#scheduling-posts)
- [Token Management](#token-management)
- [Deploy to Vercel](#deploy-to-vercel)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Python CLI (Legacy)](#python-cli-legacy)

---

## Quick Start

### 1. Install dependencies

```bash
cd web
npm install
```

### 2. Configure credentials

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your values (see [Environment Variables](#environment-variables) and [Platform Token Setup](#platform-token-setup) below).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in with your configured username/password, and start creating posts.

---

## Environment Variables

Create a `.env.local` file in the `web/` directory with the following variables:

```env
# ── Authentication ──────────────────────────────────────────────
AUTH_USERNAME=admin
AUTH_PASSWORD=your_password
SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

# ── Facebook ────────────────────────────────────────────────────
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_ACCESS_TOKEN=your_user_access_token
FACEBOOK_PAGE_ID=your_page_id

# ── Instagram (uses Facebook Graph API) ─────────────────────────
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id

# ── Mastodon ────────────────────────────────────────────────────
MASTODON_ACCESS_TOKEN=your_access_token
MASTODON_API_BASE_URL=https://mastodon.social

# ── LinkedIn ────────────────────────────────────────────────────
LINKEDIN_ACCESS_TOKEN=your_access_token
LINKEDIN_ORGANIZATION_ID=              # Leave blank to post as yourself

# ── Google Sheets (optional) ────────────────────────────────────
GOOGLE_SERVICE_ACCOUNT_JSON=           # Full JSON string of service account key
GOOGLE_SHEET_ID=your_sheet_id

# ── Cron Security (optional) ───────────────────────────────────
CRON_SECRET=optional_bearer_token_for_cron_endpoint

# ── AI Rewriting (optional) ─────────────────────────────────────
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_USERNAME` | Yes | Login username |
| `AUTH_PASSWORD` | Yes | Login password |
| `SESSION_SECRET` | Yes | Random string, 32+ characters. Used for signing session cookies |
| `FACEBOOK_APP_ID` | For token extension | Facebook App ID (needed to extend tokens) |
| `FACEBOOK_APP_SECRET` | For token extension | Facebook App Secret (needed to extend tokens) |
| `FACEBOOK_ACCESS_TOKEN` | For Facebook | User access token from Graph API Explorer |
| `FACEBOOK_PAGE_ID` | For Facebook | Your Facebook Page ID |
| `INSTAGRAM_ACCESS_TOKEN` | For Instagram | User access token with Instagram permissions |
| `INSTAGRAM_ACCOUNT_ID` | For Instagram | Instagram Business Account ID |
| `MASTODON_ACCESS_TOKEN` | For Mastodon | Application access token |
| `MASTODON_API_BASE_URL` | For Mastodon | Your instance URL (default: `https://mastodon.social`) |
| `LINKEDIN_ACCESS_TOKEN` | For LinkedIn | OAuth2 access token |
| `LINKEDIN_ORGANIZATION_ID` | No | Organization ID for company page posting. Omit for personal posts |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For Sheets sync | Full JSON string of Google service account credentials |
| `GOOGLE_SHEET_ID` | For Sheets sync | Google Sheet ID from the URL |
| `CRON_SECRET` | No | Bearer token to protect the cron endpoint |

---

## Platform Token Setup

### Facebook Setup

Facebook posting uses the **Graph API v19.0**. You need a Facebook App and a Page Access Token.

#### Step 1: Create a Facebook App

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in
2. Click **"My Apps"** > **"Create App"**
3. Select **"Other"** as the use case, then **"Business"** as the app type
4. Fill in the app name and contact email, then click **Create App**

#### Step 2: Add Required Permissions

1. In your app dashboard, go to **App Review** > **Permissions and Features**
2. Request the following permissions:
   - `pages_manage_posts` — allows posting to your Page
   - `pages_show_list` — allows listing your Pages
   - `pages_read_engagement` — allows reading Page content

#### Step 3: Generate a User Access Token

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown
3. Click **"Generate Access Token"**
4. Grant the permissions listed above when prompted
5. Copy the generated token — this is your `FACEBOOK_ACCESS_TOKEN`

> **Note:** This is a short-lived token (~1 hour). You can extend it from the app's Settings page (see [Token Management](#token-management)).

#### Step 4: Get Your Page ID

1. In the Graph API Explorer, run this query:
   ```
   GET /me/accounts?fields=id,name
   ```
2. Find your Page in the response and copy the `id` — this is your `FACEBOOK_PAGE_ID`

#### Required `.env.local` values:

```env
FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=abc123def456...
FACEBOOK_ACCESS_TOKEN=EAAxxxxxxx...
FACEBOOK_PAGE_ID=123456789012345
```

---

### Instagram Setup

Instagram posting also uses the **Facebook Graph API v19.0**. Your Instagram account must be a **Business** or **Creator** account linked to a Facebook Page.

#### Prerequisites

- An Instagram **Business** or **Creator** account (not a personal account)
- A **Facebook Page** linked to your Instagram account
- A **Facebook App** (same one from Facebook setup above)

#### Step 1: Convert to a Business/Creator Account (if needed)

1. Open Instagram > **Settings** > **Account** > **Switch to Professional Account**
2. Choose **Business** or **Creator**
3. Connect to your Facebook Page when prompted

#### Step 2: Link Instagram to Your Facebook Page

1. Go to your Facebook Page > **Settings** > **Linked Accounts** (or **Instagram**)
2. Click **Connect Account** and log in with your Instagram credentials

#### Step 3: Add Instagram Permissions to Your Facebook App

1. Go to [developers.facebook.com](https://developers.facebook.com) > Your App
2. Under **Products**, add **Instagram Graph API** (if not already added)
3. In **App Review** > **Permissions and Features**, request:
   - `instagram_basic` — read profile info
   - `instagram_content_publish` — publish content to Instagram
   - `pages_show_list` — required for Instagram through Facebook

#### Step 4: Generate an Access Token

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Click **"Generate Access Token"** and grant the Instagram permissions
4. Copy the token — this is your `INSTAGRAM_ACCESS_TOKEN`

#### Step 5: Get Your Instagram Business Account ID

1. In the Graph API Explorer, run:
   ```
   GET /me/accounts?fields=id,name,instagram_business_account
   ```
2. Find the Page connected to your Instagram account
3. Copy the `instagram_business_account.id` value — this is your `INSTAGRAM_ACCOUNT_ID`

> **Example response:**
> ```json
> {
>   "data": [
>     {
>       "id": "123456789",
>       "name": "My Page",
>       "instagram_business_account": {
>         "id": "17841400000000000"
>       }
>     }
>   ]
> }
> ```

#### Required `.env.local` values:

```env
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxx...
INSTAGRAM_ACCOUNT_ID=17841400000000000
```

#### Supported Post Types

| Type | Requirements |
|------|-------------|
| **Single Image** | Provide one image URL |
| **Carousel** | Provide multiple image URLs (up to 10) |
| **Reel** | Provide a video URL |

---

### Mastodon Setup

Mastodon uses a straightforward token-based API. Tokens don't expire unless revoked.

#### Step 1: Create an Application

1. Log in to your Mastodon instance (e.g., mastodon.social)
2. Go to **Preferences** > **Development** > **New Application**
3. Fill in the details:
   - **Application name:** Social Media Automation (or whatever you want)
   - **Scopes:** Check `read` and `write`
   - Leave the redirect URI as the default (`urn:ietf:wg:oauth:2.0:oob`)
4. Click **Submit**

#### Step 2: Copy Your Access Token

1. After creating the application, click on it to view details
2. Copy the **"Your access token"** value — this is your `MASTODON_ACCESS_TOKEN`

> **Important:** Only copy the access token, not the client key or client secret.

#### Step 3: Set Your Instance URL

If you're on an instance other than mastodon.social, set the base URL:

```env
MASTODON_API_BASE_URL=https://your-instance.example.com
```

#### Required `.env.local` values:

```env
MASTODON_ACCESS_TOKEN=your_access_token_here
MASTODON_API_BASE_URL=https://mastodon.social
```

#### Supported Post Types

| Type | Requirements |
|------|-------------|
| **Text** | Just provide content text |
| **Image** | Provide an image URL (uploaded as media attachment) |
| **Video** | Provide a video URL (async processing, up to 90s) |

---

### LinkedIn Setup

LinkedIn uses OAuth2. Getting a token requires creating an app and completing an OAuth flow.

#### Step 1: Create a LinkedIn App

1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/)
2. Click **"Create App"**
3. Fill in:
   - **App name:** Social Media Automation
   - **LinkedIn Page:** Select your company page (or create one)
   - **Logo:** Upload any image
4. Accept the terms and click **Create app**

#### Step 2: Request the "Share on LinkedIn" Product

1. In your app's dashboard, go to the **Products** tab
2. Find **"Share on LinkedIn"** and click **Request access**
3. Wait for approval (usually instant for personal use)

This grants the `w_member_social` scope needed for posting.

#### Step 3: Set Up OAuth2 Redirect

1. Go to the **Auth** tab in your app settings
2. Under **OAuth 2.0 settings**, add a redirect URL:
   ```
   https://www.linkedin.com/developers/tools/oauth/redirect
   ```

#### Step 4: Generate an Access Token

**Option A: Using LinkedIn's OAuth Token Tool**

1. Go to the **Auth** tab and note your **Client ID** and **Client Secret**
2. Visit LinkedIn's [OAuth Token Generator](https://www.linkedin.com/developers/tools/oauth/) (or use the token tool in the app dashboard)
3. Select the `w_member_social` scope (and `w_organization_social` if posting to a company page)
4. Complete the OAuth flow
5. Copy the generated access token — this is your `LINKEDIN_ACCESS_TOKEN`

**Option B: Manual OAuth2 Flow**

1. Open this URL in your browser (replace `YOUR_CLIENT_ID`):
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://www.linkedin.com/developers/tools/oauth/redirect&scope=w_member_social
   ```
2. Authorize the app and copy the `code` from the redirect URL
3. Exchange the code for a token:
   ```bash
   curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
     -d "grant_type=authorization_code" \
     -d "code=YOUR_AUTH_CODE" \
     -d "redirect_uri=https://www.linkedin.com/developers/tools/oauth/redirect" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET"
   ```
4. Copy the `access_token` from the response

> **Note:** LinkedIn tokens expire after **60 days**. You'll need to regenerate them periodically.

#### Step 5: Get Your Organization ID (Optional — for Company Page Posting)

If you want to post as a company page instead of yourself:

1. Go to your LinkedIn Company Page URL, e.g., `https://www.linkedin.com/company/your-company/`
2. Go to the **Admin view** of the page
3. The Organization ID is in the URL when viewing page analytics or admin settings
4. Alternatively, use the API:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR"
   ```

If you leave `LINKEDIN_ORGANIZATION_ID` blank, posts are published to your personal profile.

#### Required `.env.local` values:

```env
LINKEDIN_ACCESS_TOKEN=AQXxxxxxxx...
LINKEDIN_ORGANIZATION_ID=              # Optional — for company page posting
```

#### Supported Post Types

| Type | Requirements |
|------|-------------|
| **Text** | Just provide content text |
| **Image** | Provide an image URL |
| **Video** | Provide a video URL |

---

## Google Sheets Integration

Sync posts between the app and a Google Sheet. Useful for collaborative post planning.

### Step 1: Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Go to **APIs & Services** > **Library**
   - Search for "Google Sheets API" and click **Enable**
4. Create a service account:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **Service Account**
   - Fill in a name and click **Create**
   - Skip the optional role and user access steps
5. Create a key for the service account:
   - Click on the service account you just created
   - Go to the **Keys** tab
   - Click **Add Key** > **Create New Key** > **JSON**
   - Download the JSON file

### Step 2: Set Up Your Google Sheet

1. Create a new Google Sheet
2. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
   ```
3. **Share the sheet** with the service account email (found in the JSON key file under `client_email`), giving it **Editor** access

### Step 3: Configure Environment Variables

Copy the entire contents of the downloaded JSON key file and set it as the `GOOGLE_SERVICE_ACCOUNT_JSON` value (as a single line):

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...@...iam.gserviceaccount.com",...}
GOOGLE_SHEET_ID=your_sheet_id_here
```

### Using Google Sheets Sync

From the dashboard, use the **Push to Sheets** and **Pull from Sheets** buttons, or call the API directly:

```bash
# Push app posts to Google Sheets
curl -X POST http://localhost:3000/api/sync/google-sheets?direction=push

# Pull posts from Google Sheets into app
curl -X POST http://localhost:3000/api/sync/google-sheets?direction=pull
```

### Sheet Format

The sheet uses columns A–K in Sheet1:

| Column | Field | Format |
|--------|-------|--------|
| A | ID | Auto-generated UUID |
| B | Title | Text |
| C | Content | Text |
| D | Image | URL |
| E | Extra Images | Comma-separated URLs |
| F | Video | URL |
| G | Platforms | Comma-separated: `instagram,facebook,mastodon,linkedin` |
| H | Scheduled At | ISO timestamp or blank |
| I | Ready | `YES` / `NO` |
| J | Posted | `YES` / `NO` |
| K | Posted At | ISO timestamp |

---

## Scheduling Posts

### How It Works

1. Create a post with a **Scheduled At** date/time and check **Ready**
2. The cron endpoint (`/api/cron`) runs every 5 minutes and publishes any ready posts whose scheduled time has passed
3. Published posts are marked as `posted: true` with a `postedAt` timestamp

### Local Development

The cron doesn't run automatically in local dev. You have two options:

**Option A:** Visit the cron endpoint manually:
```
http://localhost:3000/api/cron
```

**Option B:** Set up a system crontab:
```bash
*/5 * * * * curl -s http://localhost:3000/api/cron > /dev/null
```

### On Vercel

Cron runs automatically every 5 minutes, configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Securing the Cron Endpoint

Set `CRON_SECRET` in your environment variables. The cron endpoint will then require:
```
Authorization: Bearer your_cron_secret
```

Vercel automatically sends this header for cron jobs if the variable is set.

---

## Token Management

### Extending Facebook/Instagram Tokens

Short-lived tokens from Graph API Explorer expire after ~1 hour. You can extend them from the Settings page:

1. Go to **Settings** in the app
2. Paste your short-lived token
3. Click **"Extend Token"**

**Result:**
- **Facebook:** Converts to a **permanent Page Access Token** (never expires)
- **Instagram:** Extends to **60 days**

> **Requires** `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to be set.

### Token Lifecycle

```
Short-lived user token (~1 hour)
  ↓  Extend via Settings page
Long-lived user token (~60 days)
  ↓  Facebook only: auto-converted
Permanent page token (never expires)
```

### LinkedIn Token Renewal

LinkedIn tokens expire after **60 days**. You need to:
1. Repeat the OAuth2 flow (Step 4 in [LinkedIn Setup](#linkedin-setup))
2. Update the token in Settings or `.env.local`

### Mastodon Tokens

Mastodon tokens **do not expire** unless you revoke them from Preferences > Development.

---

## Deploy to Vercel

### Step 1: Deploy

```bash
cd web
npx vercel
```

### Step 2: Set Environment Variables

In the [Vercel Dashboard](https://vercel.com), go to your project > **Settings** > **Environment Variables** and add all the variables from your `.env.local`.

### Step 3: Verify Cron

After deployment, Vercel will automatically run `/api/cron` every 5 minutes based on `vercel.json`.

### Data Persistence Warning

The app stores data in local JSON files (`data/posts.json` and `data/settings.json`). On **Vercel's Hobby plan**, these files reset on every deployment. For production use, consider migrating to a database (e.g., Supabase, PlanetScale).

---

## API Reference

All endpoints (except auth and cron) require a valid session cookie.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Log in with username/password |
| `POST` | `/api/auth/logout` | Log out and clear session |
| `GET` | `/api/posts` | List all posts |
| `POST` | `/api/posts` | Create a new post |
| `PATCH` | `/api/posts/[id]` | Update a post |
| `DELETE` | `/api/posts/[id]` | Delete a post |
| `POST` | `/api/posts/[id]/publish` | Publish a post immediately |
| `GET` | `/api/cron` | Run scheduled post publisher |
| `GET` | `/api/settings` | Get platform settings (tokens masked) |
| `PUT` | `/api/settings` | Update platform settings |
| `POST` | `/api/settings/extend-token` | Extend Facebook/Instagram token |
| `GET` | `/api/platforms` | Check connected platforms |
| `POST` | `/api/sync/google-sheets?direction=push` | Push posts to Google Sheets |
| `POST` | `/api/sync/google-sheets?direction=pull` | Pull posts from Google Sheets |

---

## Project Structure

```
web/                              Next.js web app
  src/
    app/
      page.tsx                    Dashboard (post list + creation form)
      settings/page.tsx           Platform token management
      login/page.tsx              Login page
      api/
        posts/                    CRUD + publish endpoints
        cron/route.ts             Scheduled post publisher
        settings/                 Settings + token extension
        platforms/route.ts        Connected platform status
        sync/google-sheets/       Google Sheets sync
        auth/                     Login/logout
    lib/
      platforms/
        facebook.ts              Facebook Graph API integration
        instagram.ts             Instagram Graph API integration
        linkedin.ts              LinkedIn API integration
        mastodon.ts              Mastodon API integration
      posts.ts                   Post CRUD (JSON file storage)
      settings.ts                Settings management
      auth.ts                    Session auth (HMAC-SHA256)
      googleSheets.ts            Google Sheets sync
    middleware.ts                 Auth guard (redirects to /login)
  data/                          Posts and settings storage (gitignored)
  vercel.json                    Vercel cron config

src/                             Python CLI (legacy)
  main.py                        CLI entrypoint
  platforms/                     Platform posting modules
  utils/                         Spreadsheet reader, AI rewriter
posts_template.xlsx              Spreadsheet template for CLI
```

---

## Python CLI (Legacy)

The original command-line interface. Reads posts from an Excel spreadsheet and publishes them.

### Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Fill in your tokens in .env
```

### Usage

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

### Spreadsheet Format

Open `posts_template.xlsx`. Each row is one post.

| Column | Required | Description |
|--------|----------|-------------|
| **Title** | Yes | Short headline |
| **Content** | Yes | Main body text |
| **Image** | No | Public image URL |
| **Scheduled At** | No | `YYYY-MM-DD HH:MM` or blank for immediate |
| **Ready** | Yes | `YES` to publish |
| **Platform** | No | `instagram`, `facebook`, `mastodon`, `linkedin`, or blank for all |
| **Posted** | Auto | Set automatically after posting |

---

## Tech Stack

- **Framework:** Next.js 16
- **UI:** React 19 + Tailwind CSS 4
- **Language:** TypeScript
- **APIs:** Facebook Graph API v19.0, Instagram Graph API v19.0, Mastodon REST API, LinkedIn Share API v2
- **Auth:** HMAC-SHA256 signed cookies
- **Storage:** Local JSON files (posts + settings)
- **Deployment:** Vercel with cron support
