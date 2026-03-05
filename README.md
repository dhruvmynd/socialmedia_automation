# Social Media Automation

Post to **Instagram, Facebook, Mastodon, and LinkedIn** from a single Excel spreadsheet. Schedule posts, attach images, and optionally rewrite content with AI before publishing.

---

## How It Works

1. Fill in `posts_template.xlsx` with your posts
2. Set `Ready = YES` on rows you want to publish
3. Run the tool — it reads the spreadsheet and posts to the platforms you choose
4. Posted rows are automatically marked as `Posted = YES` so they don't get sent twice

---

## Quick Start

### 1. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

### 2. Set up your credentials

```bash
cp .env.example .env
# Open .env and fill in your tokens (see Platform Setup below)
```

### 3. Fill in the spreadsheet

Open `posts_template.xlsx` and add your posts (see Spreadsheet Guide below).

### 4. Post

```bash
# Preview what will be posted (no actual posting)
python -m src.main preview

# Post to all platforms
python -m src.main post

# Post to specific platforms only
python -m src.main post --platforms instagram facebook

# Run as a continuous scheduler (checks every 30 seconds)
python -m src.main schedule
```

---

## Spreadsheet Guide

Open `posts_template.xlsx`. Each row is one post.

| Column | Required | Description |
|---|---|---|
| **Title** | Yes | Short headline for the post |
| **Content** | Yes | The main body text |
| **Image** | No | A publicly accessible image URL. For multiple images (carousel), separate with commas |
| **Scheduled At** | No | When to publish: `YYYY-MM-DD HH:MM`. Leave blank to post immediately |
| **Ready** | Yes | Set to `YES` to publish. Anything else (blank, `NO`, `DRAFT`) is skipped |
| **Platform** | No | Target a specific platform (`instagram`, `facebook`, `mastodon`, `linkedin`). Leave blank to post to all |
| **Posted** | Auto | Automatically set to `YES` after successful posting. Do not edit manually |

### Example rows

| Title | Content | Image | Scheduled At | Ready | Platform | Posted |
|---|---|---|---|---|---|---|
| Product Launch | We just launched our new product! Check it out. | https://example.com/image.jpg | 2026-03-10 09:00 | YES | instagram | |
| Weekly Update | Here's what happened this week at the lab... | | | YES | | |
| Draft Post | Work in progress... | | | NO | | |

### Image requirements

- Instagram and Facebook **require** a publicly accessible URL (no local file paths)
- The URL must point directly to an image file (`.jpg`, `.png`, etc.) — redirecting URLs may not work
- Free options for hosting images: [imgbb.com](https://imgbb.com), AWS S3, or any public CDN

---

## Platform Setup

### Instagram

Instagram posting requires a **Business or Creator account** linked to a **Facebook Page**.

1. Go to [developers.facebook.com](https://developers.facebook.com) → Create App → select **"Other"** type
2. Add the **Instagram Graph API** use case
3. Add these permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `pages_show_list`, `business_management`
4. Go to **Tools → Graph API Explorer**
5. Select your app, click **Generate Access Token**, and select your Facebook Page when prompted
6. Run this query to get your Instagram Account ID:
   ```
   GET /me/accounts?fields=id,name,instagram_business_account
   ```
7. Copy the `instagram_business_account.id` value
8. Add to `.env`:
   ```
   INSTAGRAM_ACCESS_TOKEN=your_token
   INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id
   ```

> **Note:** The access token expires in ~60 days. Repeat step 5 to refresh it.

---

### Facebook

1. Use the same Facebook App created for Instagram above
2. In Graph API Explorer, generate a token with `pages_manage_posts` and `pages_show_list` permissions
3. From the `/me/accounts` response, copy your **Page ID**
4. Add to `.env`:
   ```
   FACEBOOK_ACCESS_TOKEN=your_token
   FACEBOOK_PAGE_ID=your_page_id
   ```

---

### Mastodon

1. Log into your Mastodon instance (e.g. mastodon.social)
2. Go to **Preferences → Development → New Application**
3. Name it anything, grant `read write` scopes
4. Copy the **Access Token**
5. Add to `.env`:
   ```
   MASTODON_ACCESS_TOKEN=your_token
   MASTODON_API_BASE_URL=https://mastodon.social   # replace with your instance URL
   ```

---

### LinkedIn

LinkedIn requires OAuth2 and an approved app.

1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/) → Create App
2. Under **Products**, request **"Share on LinkedIn"** (for personal posts) or **"Marketing Developer Platform"** (for org pages)
3. Complete the OAuth2 flow to get an access token with `w_member_social` scope
4. For org page posting, also get `w_organization_social` and your **Organization ID**
5. Add to `.env`:
   ```
   LINKEDIN_ACCESS_TOKEN=your_token
   LINKEDIN_ORGANIZATION_ID=your_org_id   # leave blank for personal profile posts
   ```

> **Note:** LinkedIn tokens expire in 60 days. You'll need to reauthenticate periodically.

---

## AI Rewriting (Optional)

The tool can rewrite your post content using OpenAI before publishing, tailoring the tone and format for each platform automatically.

1. Add your OpenAI API key to `.env`:
   ```
   OPENAI_API_KEY=your_key
   OPENAI_MODEL=gpt-4o
   ```
2. Use the `--rewrite` flag when posting:
   ```bash
   python -m src.main post --rewrite
   ```
3. Preview rewrites without posting:
   ```bash
   python -m src.main rewrite --platform instagram
   ```

**SFU CoPilot users:** Set `OPENAI_BASE_URL` to your CoPilot endpoint and use your CoPilot API key.

---

## Scheduling

### Continuous mode (runs forever)

```bash
python -m src.main schedule
```

Checks the spreadsheet every 30 seconds and posts rows when their `Scheduled At` time arrives.

### Cron job (runs periodically)

```cron
*/30 * * * * cd /path/to/project && .venv/bin/python -m src.main post
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values you need.

```env
# Mastodon
MASTODON_ACCESS_TOKEN=
MASTODON_API_BASE_URL=https://mastodon.social

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# Facebook
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=

# LinkedIn
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_ORGANIZATION_ID=

# OpenAI (optional)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Spreadsheet
SPREADSHEET_PATH=posts_template.xlsx
```

---

## Project Structure

```
src/
  main.py              CLI entrypoint
  scheduler.py         Continuous scheduler loop
  platforms/
    mastodon.py        Mastodon poster
    instagram.py       Instagram poster (Facebook Graph API)
    facebook.py        Facebook Page poster
    linkedin.py        LinkedIn poster
  utils/
    spreadsheet.py     Reads Excel/CSV → Post objects, marks posted rows
    rewriter.py        OpenAI content rewriter
scripts/
  create_template.py   Generates posts_template.xlsx
posts_template.xlsx    Your posts go here
.env.example           Template for credentials
```
