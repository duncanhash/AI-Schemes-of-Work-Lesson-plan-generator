# Pedagogy | The Heart of Kenyan CBC

A production-ready AI dashboard for Kenyan Facilitators to generate KICD-compliant Schemes of Work, Lesson Plans, and Assessment Tools.

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
   ```
   `MONGODB_URI` is required. The app no longer falls back to `local_db.json`; configure a reachable MongoDB database locally and in the Render environment settings.

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
Ensure you have the following images in the `public/` directory for the landing page:
- `hero_cbc.png` (Hero section)
- `students_research.png` (Features background)
- `teachers_hub.png` (Community section)

## Tech Stack
- **Backend**: Node.js, Express, Mongoose (MongoDB)
- **Frontend**: Vanilla JS, CSS3 (Glassmorphism), HTML5
- **AI**: Google Gemini AI
- **Export**: html-to-docx
