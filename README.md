# Canvas Calendar Bridge MCP Server

A Model Context Protocol (MCP) server that seamlessly integrates Canvas LMS with Google Calendar through Claude Desktop. Automatically sync assignments, quizzes, and discussions from Canvas to your Google Calendar with proper timezone conversion (EST).

## Features

✅ **Canvas Integration**
- Fetch assignments, quizzes, and discussions from all active courses
- Automatic type detection (Assignment, Quiz, Discussion)
- Filters for published items with due dates
- Works with any enrollment type (Student, Teacher, TA, Designer)

✅ **Google Calendar Integration**
- OAuth 2.0 authentication flow
- Create, update, delete, and list calendar events
- Automatic timezone conversion to EST (America/New_York)
- Smart reminders (24 hours and 1 hour before due)

✅ **MCP Tools (8 Total)**
- `get_google_auth_url` - Start Google OAuth flow
- `set_google_auth_code` - Complete authentication
- `create_calendar_event` - Create any calendar event
- `list_calendar_events` - View upcoming events
- `update_calendar_event` - Modify existing events
- `delete_calendar_event` - Remove events
- `get_canvas_assignments` - Fetch Canvas assignments
- `sync_to_calendar` - Sync Canvas → Google Calendar

✅ **Robust Error Handling**
- 30-second timeout on API requests
- Fail-fast error reporting (no silent failures)
- Comprehensive debug logging to MCP logs
- Deterministic behavior (consistent results)

## Prerequisites

- **Node.js** 18+ and npm
- **Canvas LMS** account with API access
- **Google Cloud** account for Calendar API
- **Claude Desktop** (for MCP integration)

## Installation

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/canvas-calendar-bridge.git
cd canvas-calendar-bridge
npm install
```

### 2. Canvas API Setup

1. Log into your Canvas LMS
2. Go to **Account → Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Give it a name (e.g., "Calendar Bridge")
6. **Copy the token** (you won't see it again!)

### 3. Google Calendar API Setup

#### Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. **Enable Google Calendar API:**
   - Go to **APIs & Services → Library**
   - Search for "Google Calendar API"
   - Click **Enable**

#### Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: "Canvas Calendar Bridge"
   - Add your email
   - Scopes: Add `https://www.googleapis.com/auth/calendar`
4. Application type: **Desktop app**
5. Name: "Canvas Calendar Bridge"
6. Click **Create**
7. **Copy Client ID and Client Secret**

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```bash
# Canvas Configuration
CANVAS_BASE_URL=https://your-school.instructure.com
CANVAS_API_TOKEN=your_canvas_api_token_here

# Google OAuth Configuration
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Google Calendar ID
GOOGLE_CALENDAR_ID=primary
```

⚠️ **SECURITY WARNING:** Never commit `.env` to Git! It contains your API keys.

### 5. Build the Server

```bash
npm run build
```

## Usage with Claude Desktop

### Configure Claude Desktop

1. Open Claude Desktop config:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add the MCP server:

```json
{
  "mcpServers": {
    "canvas-calendar-bridge": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\canvas-calendar-bridge\\build\\index.js"
      ],
      "env": {
        "CANVAS_BASE_URL": "https://your-school.instructure.com",
        "CANVAS_API_TOKEN": "your_canvas_api_token",
        "GOOGLE_OAUTH_CLIENT_ID": "your_client_id.apps.googleusercontent.com",
        "GOOGLE_OAUTH_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_REFRESH_TOKEN": "",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/oauth2callback",
        "GOOGLE_CALENDAR_ID": "primary"
      }
    }
  }
}
```

**Note:** Use forward slashes `/` or escaped backslashes `\\` in Windows paths.

3. **Restart Claude Desktop**

### First-Time Setup: Google OAuth

1. In Claude Desktop, ask:
   ```
   Get the Google Calendar authorization URL
   ```

2. Click the URL provided and authorize the app

3. Copy the authorization code from the redirect URL

4. In Claude, provide the code:
   ```
   Set Google auth code: YOUR_CODE_HERE
   ```

5. **IMPORTANT:** Copy the refresh token from Claude's response

6. Add the refresh token to your Claude Desktop config:
   ```json
   "GOOGLE_REFRESH_TOKEN": "your_refresh_token_here"
   ```

7. **Restart Claude Desktop again**

### Using the Tools

#### Get Canvas Assignments

```
Show me my Canvas assignments
```

Returns all published assignments with due dates from all your courses.

#### Sync to Google Calendar

```
Sync my Canvas assignments to Google Calendar for the next 14 days
```

Creates calendar events for each assignment with:
- Assignment name and type (📚 Assignment, 📝 Quiz, 💬 Discussion)
- Due date/time in EST
- Course name
- Points possible
- Direct link to Canvas
- Reminders (24 hours and 1 hour before)

#### Manual Calendar Operations

```
Create a calendar event for "Team Meeting" on January 15, 2025 at 2:00 PM to 3:00 PM
```

```
List my upcoming calendar events for the next 7 days
```

```
Update calendar event [event_id] to start at 3:00 PM
```

```
Delete calendar event [event_id]
```

## Available MCP Tools

### Google Calendar Authentication
- **get_google_auth_url** - Get OAuth authorization URL
- **set_google_auth_code** - Exchange auth code for tokens

### Calendar Management
- **create_calendar_event** - Create any calendar event (not just Canvas)
- **list_calendar_events** - List upcoming events with filtering
- **update_calendar_event** - Update event details
- **delete_calendar_event** - Remove an event

### Canvas Integration
- **get_canvas_assignments** - Fetch all assignments/quizzes from Canvas
- **sync_to_calendar** - Sync Canvas items to Google Calendar

## Debugging

### View MCP Server Logs

In Claude Desktop:
1. Click **Developer** menu
2. Select **Open MCP Log File**
3. Search for `[Canvas API]` or `[get_canvas_assignments]`

The logs show detailed debug information:
- Canvas API URLs being called
- Raw JSON responses from Canvas
- Which items are included/excluded and why
- Timezone conversions
- Success/failure status

### Common Issues

**"No assignments found" but items exist in Canvas**
- Check MCP logs for `Active courses found: 0`
- Verify `CANVAS_API_TOKEN` is correct
- Verify `CANVAS_BASE_URL` matches your institution

**"Canvas API timeout"**
- Canvas API may be slow or down
- Logs will show: `Canvas API timeout after 30000ms`
- Try again in a few minutes

**Google Calendar authentication fails**
- Verify OAuth credentials are correct
- Check that Google Calendar API is enabled
- Ensure redirect URI matches exactly: `http://localhost:3000/oauth2callback`

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node build/index.js
```

## Architecture

```
src/
├── index.ts           # MCP server & tool handlers
├── canvas.ts          # Canvas API client
├── google-calendar.ts # Google Calendar client
└── types.ts           # TypeScript interfaces

build/                 # Compiled JavaScript (git-ignored)
.env                   # API keys (git-ignored, YOU create this)
.env.example           # Template with placeholders
```

## Security

⚠️ **NEVER commit these files to Git:**
- `.env` - Contains your API keys
- `credentials.json` - Google OAuth secrets
- `token.json` - Google OAuth tokens

✅ **Safe to commit:**
- `.env.example` - Only has placeholders
- All source code in `src/`
- `package.json` and `package-lock.json`

The `.gitignore` is pre-configured to protect your credentials.

## Timezone Handling

All Canvas assignments are converted from UTC to **EST (America/New_York)**:

- Canvas stores: `2025-11-08T04:59:59Z` (UTC)
- Displays to user: "November 7, 2025 at 11:59 PM" (EST)
- Google Calendar event: Created at the correct EST time

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC

## Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Uses [Canvas LMS API](https://canvas.instructure.com/doc/api/)
- Uses [Google Calendar API](https://developers.google.com/calendar)
- Designed for [Claude Desktop](https://claude.ai/download)
