# Pedagogy | Teacher SOW & Lesson Plan Generator

A teacher-focused AI dashboard for Kenyan teachers to generate KICD-aligned Schemes of Work, Lesson Plans, and Assessment Tools.

## Teacher-only access

The app now provides teacher accounts only. Parent registration, login, dashboards, progress sharing, and parent-facing chat have been removed. Existing parent accounts and their saved records are not automatically deleted or converted; they are no longer able to sign in. An administrator can deliberately promote an existing account to a teacher with `node manage-users.js set-role <email>`.

## Scheme of Work lesson count

Choose the number of weeks (1-20) in the SOW screen. Both the curriculum-upload and AI-generation paths request exactly five lessons per week, and the server rejects an AI result that does not contain those lessons in week/lesson order. Blank SOW templates also contain five numbered lesson rows per week. The default is 12 weeks.

## Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd pedagogy
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3000
   EMAIL_USER=your_gmail_address
   EMAIL_PASS=your_gmail_app_password
   MONGODB_URI=your_mongodb_atlas_connection_string
   JWT_SECRET=your_random_secret_string
   GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
   ```
   `MONGODB_URI` is required. The app no longer falls back to `local_db.json`; configure a reachable MongoDB database locally and in the Render environment settings.
   Local accounts register with a username, email, and password, then verify the email with the emailed code. They can sign in using either username or email plus password. Google sign-in is optional; configure `GOOGLE_CLIENT_ID` as a Google OAuth web client ID and allow the app's origin in its authorized JavaScript origins to enable it.

4. **Run Locally**:
   ```bash
   npm run dev
   ```
   The server listens at `http://localhost:3000` by default. It requires a reachable `MONGODB_URI`; set the URI in local `.env` and separately in Render's Environment settings. GitHub stores/deploys the source, it is not the database host.

The automatic CBC News Bot is disabled by default. To enable its twice-daily messages later, set `ENABLE_CBC_NEWS_BOT=true` in the hosting environment.

## Migrating Local Data

`local_db.json` is ignored by Git, so run the migration on the computer that has that file. Set a valid `MONGODB_URI` in `.env`, then preview the import with:

```bash
npm run migrate:local-db
```

The preview prints counts only. To write records, run:

```bash
npm run migrate:local-db -- --apply
```

The migration inserts missing records and leaves matching MongoDB records unchanged. It is safe to rerun; keep a backup of `local_db.json` until you have verified the imported records in Atlas.

## Deployment on Render

1. **Connect your GitHub repository** to Render.
2. Select **Web Service** as the service type.
3. **Environment Variables**: Add all variables from your `.env` in the Render dashboard.
4. **Build Command**: `npm install`
5. **Start Command**: `node server.js`

### Important Note on Images
Static site artwork is grouped in `public/images/` and served locally:
- `hero_students_project.svg` (Hero section)
- `students_research.svg` (Features background)
- `teachers_hub.svg` (Community section)
- `logo.svg` (Site logo)

User-uploaded files remain in `uploads/`, separate from the site's artwork.

### Chat retention and limits
Chat messages older than 36 hours (and undated legacy records) are excluded from chat history and deleted at startup and approximately once per minute while the server is running. Local database migrations only import chat records with a timestamp that is still within that 36-hour window; undated legacy messages are skipped.

AI document generation is currently limited to 10 requests per user per hour by `generateRateLimit` in `server.js`. This counter is held in server memory, so it resets on restart and is not shared across multiple server instances.

### Testing
Run the focused offline tests with `npm test`. The files in `tests/fixtures/` are saved HTML examples for reference, not production data. For an API integration check, start the app with `npm run dev`, then run `node test-website.js` in another terminal. It uses the configured MongoDB and creates a test account and chat message, so use a disposable development database. For syntax-only checks, run `node --check server.js` and `node --check public/script.js`.

## Data, deployment, and backups

GitHub stores the source code. A push to the connected branch lets Render fetch and run that code; the running server connects to MongoDB using Render's environment variables. User records and saved teaching content live in MongoDB, not in GitHub. `local_db.json` is an old local migration source, not a live database or an automatic outage backup. MongoDB Atlas backups must be configured separately. Uploaded file bytes are currently stored under `uploads/`, which may be temporary on Render; use persistent/object storage if uploads must survive deployments or restarts.

## Tech Stack
- **Backend**: Node.js, Express, Mongoose (MongoDB)
- **Frontend**: Vanilla JS, CSS3 (Glassmorphism), HTML5
- **AI**: Google Gemini AI
- **Export**: html-to-docx
