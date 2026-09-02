# CID Aprueba — Coding Standards & Best Practices

> Conventions, patterns, and guidelines for all contributors.

---

## 1. Code Style

### JavaScript (Backend & Frontend)

- **ESLint** with a minimal config extending `eslint:recommended`
- **Semicolons:** Always use semicolons
- **Quotes:** Single quotes for strings, backticks for interpolation
- **Indentation:** 2 spaces
- **Trailing commas:** Use in multiline objects and arrays
- **Variable declarations:** Prefer `const`; use `let` only when reassignment is needed; never use `var`
- **Functions:** Prefer `async/await` over raw Promises; use arrow functions for callbacks
- **Naming:**
  - `camelCase` for variables, functions, and method names
  - `PascalCase` for classes and constructor functions
  - `UPPER_SNAKE_CASE` for constants and environment variables
  - `snake_case` for database column and table names

### SQL

- Keywords in UPPERCASE: `SELECT`, `INSERT`, `WHERE`, `JOIN`
- Table and column names in `snake_case`
- Always use parameterized queries — never concatenate user input into SQL strings

### CSS

- Use CSS custom properties (variables) for all brand colors and spacing
- BEM-like naming: `.card__header`, `.card__body`, `.btn--primary`
- Mobile-first approach; use `min-width` media queries for larger screens

### ESLint Configuration

```json
{
  "env": {
    "node": true,
    "es2022": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 2022
  },
  "rules": {
    "semi": ["error", "always"],
    "quotes": ["error", "single", { "allowTemplateLiterals": true }],
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off",
    "indent": ["error", 2],
    "comma-dangle": ["error", "always-multiline"],
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

---

## 2. Error Handling

### Custom Error Class

All application errors should use the [`AppError`](src/utils/AppError.js) class:

```javascript
class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}
```

### Usage in Controllers

```javascript
// Throw operational errors — they will be caught by the error handler
if (!document) {
  throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
}

if (user.role_level !== document.current_approval_level) {
  throw new AppError('Not authorized to approve at this level', 403, 'FORBIDDEN');
}
```

### Centralized Error Handler Middleware

The [`errorHandler`](src/middleware/errorHandler.js) middleware is the last middleware registered on the Express app. It catches all errors and returns a consistent JSON response:

```javascript
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: err.code || 'INTERNAL_ERROR',
    message: err.isOperational ? err.message : 'An unexpected error occurred',
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  logger.error(`${statusCode} - ${err.message}`, { stack: err.stack });
  res.status(statusCode).json(response);
}
```

### Rules

- **Never** let unhandled promise rejections crash the server — wrap async route handlers
- Use an `asyncHandler` wrapper to avoid try/catch in every controller:

```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

- Log all errors with context (request path, user ID, timestamp)
- Distinguish **operational errors** (expected, like 404) from **programming errors** (bugs)

---

## 3. Security

### Input Validation

- Validate **all** incoming data using `express-validator` at the route level
- Sanitize strings to prevent XSS: trim whitespace, escape HTML entities
- Validate file uploads: check MIME type, enforce size limits, reject executable files

```javascript
// Example: document upload validation
router.post('/documents',
  authenticate,
  upload.single('file'),
  body('title').trim().notEmpty().isLength({ max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  validate,
  documentController.upload,
);
```

### SQL Injection Prevention

- **Always** use parameterized queries with `better-sqlite3`:

```javascript
// CORRECT
const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);

// NEVER DO THIS
const doc = db.prepare(`SELECT * FROM documents WHERE id = ${id}`).get();
```

### Authentication Security

| Practice | Implementation |
|----------|---------------|
| Password hashing | `bcrypt` with salt rounds ≥ 10 |
| JWT secret | Minimum 256-bit random string, stored in `.env` |
| Token expiry | Default 24 hours; configurable via `JWT_EXPIRES_IN` |
| Token storage | `localStorage` on client (acceptable for internal tool) |
| Password requirements | Minimum 8 characters |

### CORS

- In development: allow `localhost` origins
- In production: restrict to the specific deployment domain
- Never use `Access-Control-Allow-Origin: *` in production

### File Upload Security

- Store uploads **outside** the public directory
- Generate unique filenames (UUID) — never use the original filename for storage
- Validate file extensions against an allowlist: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.jpg`, `.png`
- Enforce maximum file size (default: 10 MB)
- Serve files through an authenticated download endpoint, not as static assets

### HTTP Headers

- Use `helmet` middleware for security headers
- Set `X-Content-Type-Options: nosniff`
- Set `X-Frame-Options: DENY`
- Disable `X-Powered-By` header

---

## 4. API Response Format

All API responses follow a consistent JSON structure:

### Success Response

```json
{
  "success": true,
  "data": { },
  "message": "Document uploaded successfully"
}
```

### Error Response

```json
{
  "success": false,
  "error": "DOCUMENT_NOT_FOUND",
  "message": "The requested document does not exist"
}
```

### Paginated List Response

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 42,
    "page": 1,
    "limit": 20
  },
  "message": null
}
```

### HTTP Status Code Usage

| Code | Usage |
|------|-------|
| `200` | Successful GET, PUT, PATCH |
| `201` | Successful POST (resource created) |
| `400` | Validation errors, malformed request |
| `401` | Missing or invalid JWT |
| `403` | Valid JWT but insufficient role/permissions |
| `404` | Resource not found |
| `409` | Conflict (e.g., duplicate username) |
| `500` | Unexpected server error |

---

## 5. File Organization Principles

### Single Responsibility

Each file should have one clear purpose:

- **Routes** — Define URL patterns and attach middleware + controller methods. No business logic.
- **Controllers** — Parse request, call model methods, format response. Thin layer only.
- **Models** — All database queries and business logic. This is where the "fat" lives.
- **Middleware** — Cross-cutting concerns: auth, validation, error handling, logging.
- **Utils** — Shared helpers that don't fit elsewhere.

### Import Order

Within each file, organize imports in this order:

```javascript
// 1. Node.js built-in modules
const path = require('path');
const fs = require('fs');

// 2. Third-party modules
const express = require('express');
const bcrypt = require('bcrypt');

// 3. Local modules
const User = require('../models/User');
const AppError = require('../utils/AppError');
```

### Model Pattern

Models are plain objects (not classes) that export functions. Each function receives parameters and interacts with the database:

```javascript
// src/models/Document.js
const db = require('../config/database');

const Document = {
  findById(id) {
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  },

  findByStatus(status, limit = 20, offset = 0) {
    return db.prepare(
      'SELECT * FROM documents WHERE status = ? LIMIT ? OFFSET ?'
    ).all(status, limit, offset);
  },

  create({ title, description, filePath, originalFilename, uploadedBy }) {
    // ...
  },
};

module.exports = Document;
```

---

## 6. Git Conventions

### Branch Naming

```
main              # Production-ready code
develop           # Integration branch
feature/<name>    # New features (e.g., feature/approval-workflow)
fix/<name>        # Bug fixes (e.g., fix/jwt-expiry-check)
docs/<name>       # Documentation updates
```

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

feat(auth): add JWT refresh token endpoint
fix(approval): prevent double-approval at same level
docs(readme): add deployment instructions
chore(deps): update express to 4.19
refactor(models): extract shared query builder
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`

### .gitignore

```
node_modules/
data/
uploads/
.env
*.log
```

---

## 7. Environment Configuration

### Rules

- **Never** commit `.env` files
- Maintain `.env.example` with all required variables (no real values)
- Access environment variables only through [`src/config/`](src/config/) modules — never read `process.env` directly in controllers or models
- Validate required environment variables at startup; fail fast with a clear error if any are missing

### Config Module Pattern

```javascript
// src/config/auth.js
require('dotenv').config();

module.exports = {
  jwtSecret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET is required'); })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};
```

---

## 8. Logging

### Approach

Use a simple [`logger`](src/utils/logger.js) utility that wraps `console` methods with timestamps and log levels. If the project grows, replace with `pino` or `winston`.

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unrecoverable errors, failed operations |
| `warn` | Recoverable issues, deprecation notices |
| `info` | Significant events: server start, user login, document approved |
| `debug` | Detailed diagnostic info (disabled in production) |

### What to Log

- Server startup with port and environment
- Every authentication attempt (success and failure, without passwords)
- Every approval/rejection action with document ID, user ID, and level
- All errors with stack traces
- Database initialization and migration events

### What NOT to Log

- Passwords or password hashes
- Full JWT tokens
- Sensitive personal data
- Request/response bodies in production (unless debugging)

### Log Format

```
[2026-09-02T13:45:00.000Z] [INFO] Server started on port 3000 (development)
[2026-09-02T13:45:12.000Z] [INFO] User login: userId=3, username=coordinador
[2026-09-02T13:45:30.000Z] [INFO] Document approved: docId=15, level=2, userId=5
[2026-09-02T13:45:31.000Z] [ERROR] Database error: SQLITE_CONSTRAINT ...
```

---

## 9. Testing

### Approach

Use a lightweight testing setup appropriate for the project scale:

- **Test runner:** Node.js built-in test runner (`node --test`) or `vitest`
- **Assertions:** Node.js built-in `assert` module or `vitest` expect
- **HTTP testing:** `supertest` for endpoint integration tests

### Test Structure

```
tests/
├── auth.test.js          # Login, registration, token validation
├── documents.test.js     # Upload, list, detail, download
└── approvals.test.js     # Approve, reject, workflow progression
```

### Testing Priorities

1. **Approval workflow logic** — The core business value. Test the full chain: upload → approve through all 6 levels → final status. Test rejection at each level.
2. **Authorization rules** — Verify that users cannot approve at wrong levels, cannot access restricted documents.
3. **Input validation** — Confirm that malformed requests are rejected with proper error codes.
4. **Authentication** — Token generation, expiry, invalid token handling.

### Test Database

- Use a separate in-memory SQLite database for tests: `':memory:'`
- Seed test data before each test suite
- Each test suite should be independent — no shared state between test files

### Example Test

```javascript
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../server');

describe('POST /api/approvals/:documentId/approve', () => {
  it('should reject if user role does not match current approval level', async () => {
    const res = await request(app)
      .post('/api/approvals/1/approve')
      .set('Authorization', `Bearer ${level3UserToken}`)
      .send({ comments: 'Looks good' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'FORBIDDEN');
  });
});
```

---

## 10. Frontend Standards

### JavaScript

- No frameworks or build tools — vanilla ES6+ modules loaded via `<script>` tags
- Use `fetch()` for all API calls through a centralized [`api.js`](public/js/api.js) wrapper
- Handle loading states: show spinners during API calls, disable buttons to prevent double-clicks
- Display user-friendly error messages from API responses

### CSS

- Single stylesheet: [`styles.css`](public/css/styles.css)
- CSS custom properties for theming at the `:root` level
- Responsive layout using CSS Grid and Flexbox
- No CSS frameworks — keep the design minimal and custom

### Accessibility

- Use semantic HTML elements: `<main>`, `<nav>`, `<section>`, `<button>`
- All form inputs must have associated `<label>` elements
- Interactive elements must be keyboard-accessible
- Use `aria-` attributes where semantic HTML is insufficient
- Maintain sufficient color contrast ratios (WCAG AA minimum)

### HTML

- One HTML file per page (no SPA routing)
- Navigation between pages via standard links
- Progressive enhancement: core functionality works without JavaScript where possible
