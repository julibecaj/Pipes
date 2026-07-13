# Pipes Frontend

Frontend single-page app for Pipes, a CI/CD pipeline simulator. The app lets users sign in, create and edit pipelines, trigger runs, inspect run status, and review stage/job output.

## Tech Stack

- Plain HTML, CSS, and JavaScript
- No frontend framework
- No build step
- Browser `fetch` API for backend communication
- `localStorage` for the auth token and current username

## Package Structure

```text
                          Frontend Package
                                 |
        -------------------------------------------------
        |             |             |          |         |
   package.json   index.html      css/       js/     images/
        |             |             |          |         |
   npm scripts   App shell      style.css   app.js   Logo and SVG assets
        |
     scripts/
        |
    serve.mjs
 Local static server
```

```text
Frontend/
|-- package.json        npm package metadata and scripts
|-- index.html          main app markup
|-- css/
|   `-- style.css       app styling and layout
|-- js/
|   `-- app.js          app state, API calls, rendering, and UI behavior
|-- scripts/
|   `-- serve.mjs       local static server used by npm scripts
`-- images/
    |-- pixil-frame-0.png
    `-- Pipes Hero Section.svg
```

## Requirements

- A modern browser
- Node.js, if you want to run the bundled static server
- A local static server, such as the VS Code Live Server extension, if you do not use npm
- Pipes backend running at:

```text
http://localhost:8080/api
```

The API base URL is configured in `js/app.js`:

```js
const API = 'http://localhost:8080/api';
```

Change this value if your backend runs on a different host or port.

## Running Locally

1. Start the backend server on port `8080`.
2. From this folder, start the frontend:

```bash
npm run dev
```

3. Visit:

```text
http://127.0.0.1:5500
```

You can also open `Frontend/index.html` with Live Server. Its URL is commonly:

```text
http://localhost:5500/Frontend/index.html
```

Opening `index.html` directly in a browser may work, but a local server is recommended to avoid browser restrictions around local files and API calls.

## Main Features

- Register and sign in
- Persist login state in `localStorage`
- View dashboard stats and recent pipeline runs
- Create, edit, search, and delete pipelines
- Build pipelines from stages and jobs
- Trigger pipeline runs
- View run details, stage results, job output, and logs
- Poll active runs until they finish
- Cancel or delete runs

## Backend Endpoints Used

The frontend expects these API routes to exist:

```text
POST   /auth/login
POST   /auth/register
GET    /runs/stats
GET    /runs/recent?limit=...
GET    /runs/:id
POST   /runs/:id/cancel
DELETE /runs/:id
GET    /pipelines
GET    /pipelines/search?q=...
POST   /pipelines
GET    /pipelines/:id
PUT    /pipelines/:id
DELETE /pipelines/:id
POST   /pipelines/:id/runs
GET    /pipelines/:id/runs
```

Most responses are expected to return either the object directly or a wrapper with a `data` property.

## Development Notes

- Keep UI behavior in `js/app.js`.
- Keep visual changes in `css/style.css`.
- The app uses global functions referenced from inline `onclick` handlers in `index.html`.
- Auth values are stored under `pipes_token` and `pipes_user` in `localStorage`.
- Run detail pages poll the backend every two seconds while a run is active.
