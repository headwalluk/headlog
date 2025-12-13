# UI Style Guide: Conventions & Cross-Cutting Patterns

## Overview

This guide documents conventions and patterns that apply across all UI pages in the Headlog application.

## Bootstrap 5

### Version & Source

- **Version**: Bootstrap 5.3.x (check [package.json](../package.json) for exact version)
- **Source**: npm package, served from `/vendor/bootstrap/` (not CDN)
- **Icons**: Bootstrap Icons 1.11.x from `/vendor/bootstrap-icons/`

### Installation

Bootstrap is installed via npm and served directly from `node_modules`:

```bash
npm install bootstrap bootstrap-icons
```

Assets are automatically available at:
- `/vendor/bootstrap/dist/css/bootstrap.min.css`
- `/vendor/bootstrap/dist/js/bootstrap.bundle.min.js`
- `/vendor/bootstrap-icons/font/bootstrap-icons.min.css`

### Benefits

- Version control through package.json
- Automatic updates with `npm update`
- No external CDN dependencies
- Works offline during development

## Template Engine

### EJS

- **Version**: 3.1.x
- **Server-side rendering**: No client-side JavaScript frameworks
- **Location**: `src/views/`

### EJS Limitations

**Important**: EJS does not support modern JavaScript syntax in `<% %>` tags:

❌ **Don't use:**
```ejs
<% items.forEach(item => { %>
  ...
<% }); %>

<% for (const item of items) { %>
  ...
<% } %>
```

✅ **Use traditional for loops:**
```ejs
<% for (var i = 0; i < items.length; i++) { %>
  <% var item = items[i]; %>
  ...
<% } %>
```

### Common EJS Patterns

**Conditional Rendering:**
```ejs
<% if (condition) { %>
  <p>Content</p>
<% } %>

<% if (user.is_superuser) { %>
  <button>Admin Action</button>
<% } else { %>
  <p>You don't have permission</p>
<% } %>
```

**Ternary Operators (in attributes):**
```ejs
<input type="checkbox" <%= item.is_active ? 'checked' : '' %>>
<span class="badge <%= user.is_active ? 'bg-success' : 'bg-secondary' %>">
```

**Default Values:**
```ejs
<input value="<%= item.name || '' %>">
<%= search || '' %>
<%= targetItem ? targetItem.field : 'default' %>
```

## Notifications

### Toast Notifications (Preferred)

Use Bootstrap 5 toasts for action feedback:

```html
<!-- Toast Container (bottom-left) -->
<div class="toast-container position-fixed bottom-0 start-0 p-3" style="z-index: 1050;">
  <% if (success) { %>
    <div id="successToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-success text-white">
        <i class="bi bi-check-circle me-2"></i>
        <strong class="me-auto">Success</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        <%= success %>
      </div>
    </div>
  <% } %>
  
  <% if (error) { %>
    <div id="errorToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-danger text-white">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong class="me-auto">Error</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        <%= error %>
      </div>
    </div>
  <% } %>
</div>

<script>
  document.addEventListener('DOMContentLoaded', function() {
    ['successToast', 'errorToast'].forEach(function(id) {
      const element = document.getElementById(id);
      if (element) {
        const toast = new bootstrap.Toast(element, {
          autohide: true,
          delay: 5000
        });
        toast.show();
      }
    });
  });
</script>
```

**When to use toasts:**
- Success confirmations after actions
- Error messages after failed operations
- General user feedback
- Messages that don't require immediate attention

**Toast specifications:**
- **Position**: Bottom-left (`position-fixed bottom-0 start-0`)
- **Auto-dismiss**: 5 seconds
- **Colors**: 
  - Success: `bg-success` (green)
  - Error: `bg-danger` (red)
  - Info: `bg-info` (blue) - rarely used
- **Icons**: Match the message type
- **z-index**: 1050 (above modals)

### Inline Alerts (For Context)

Use Bootstrap alerts for contextual information that should remain visible:

```html
<!-- Warnings -->
<div class="alert alert-warning">
  <i class="bi bi-exclamation-triangle"></i>
  <strong>Warning:</strong> This action has consequences.
</div>

<!-- Informational -->
<div class="alert alert-info">
  <i class="bi bi-info-circle"></i>
  This is helpful information about this section.
</div>
```

**When to use inline alerts:**
- Warnings about special conditions (not dismissible)
- Persistent context-sensitive information
- Help text within forms or sections
- Empty states ("No items found")
- Login errors (high visibility needed)

**Don't use for:**
- Action feedback (use toasts)
- Page-level success messages (use toasts)
- Temporary notifications (use toasts)

## Buttons

### With Icons

**Always use `text-nowrap` class:**

```html
<button class="btn btn-primary text-nowrap">
  <i class="bi bi-plus-circle"></i> Create
</button>

<a href="/edit" class="btn btn-sm btn-primary text-nowrap">
  <i class="bi bi-pencil"></i> Edit
</a>

<button class="btn btn-danger text-nowrap">
  <i class="bi bi-trash"></i> Delete
</button>
```

**Why**: Prevents icon and text from wrapping to separate lines on narrow screens.

### Button Colors

Use semantic colors:

- **Primary** (`btn-primary`): Main actions (Create, Save, Update)
- **Success** (`btn-success`): Positive confirmations
- **Danger** (`btn-danger`): Destructive actions (Delete)
- **Warning** (`btn-warning`): Caution actions (Reset Password)
- **Info** (`btn-info`): View/details actions
- **Secondary** (`btn-secondary`): Cancel, back actions
- **Outline variants** (`btn-outline-*`): Secondary actions (Remove role)

### Button Sizes

- **Default**: Regular buttons in forms and headers
- **Small** (`btn-sm`): Action buttons in tables, compact spaces
- **Large** (`btn-lg`): Rarely used, only for prominent CTAs

## Icons

### Bootstrap Icons

Use Bootstrap Icons throughout the UI:

```html
<i class="bi bi-[icon-name]"></i>
```

### Common Icons

| Purpose | Icon | Class |
|---------|------|-------|
| Create | ➕ | `bi-plus-circle` |
| Edit | ✏️ | `bi-pencil` |
| Delete | 🗑️ | `bi-trash` |
| View | 👁️ | `bi-eye` |
| Save | ✓ | `bi-check-circle` |
| Cancel | ✗ | `bi-x-circle` |
| Search | 🔍 | `bi-search` |
| Filter | 🔽 | `bi-funnel` |
| User | 👤 | `bi-person` or `bi-person-circle` |
| Users | 👥 | `bi-people` |
| Settings | ⚙️ | `bi-gear` |
| Key | 🔑 | `bi-key` |
| Lock | 🔒 | `bi-lock` |
| Shield | 🛡️ | `bi-shield` or `bi-shield-check` |
| Info | ℹ️ | `bi-info-circle` |
| Warning | ⚠️ | `bi-exclamation-triangle` |
| Success | ✓ | `bi-check-circle` |
| Error | ⚠️ | `bi-exclamation-triangle` |
| Back | ← | `bi-arrow-left` |
| Logout | 📤 | `bi-box-arrow-right` |
| Dashboard | 📊 | `bi-speedometer2` |
| Clock | 🕒 | `bi-clock-history` |
| Collection | 📁 | `bi-collection` |

### Icon Placement

**In buttons**: Icon before text
```html
<i class="bi bi-plus-circle"></i> Create User
```

**In headers**: Icon before title
```html
<h5><i class="bi bi-info-circle"></i> Information</h5>
```

**In alerts**: Icon at start
```html
<i class="bi bi-exclamation-triangle"></i> Warning message
```

## Badges

### Status Badges

```html
<!-- Active/Inactive -->
<span class="badge bg-success">Active</span>
<span class="badge bg-secondary">Inactive</span>

<!-- User Types -->
<span class="badge bg-danger">Superuser</span>
<span class="badge bg-info">User</span>

<!-- Custom Status -->
<span class="badge bg-warning">Pending</span>
<span class="badge bg-primary">Verified</span>
```

### Badge Colors

- **Success** (`bg-success`): Active, enabled, positive states
- **Secondary** (`bg-secondary`): Inactive, disabled, neutral
- **Danger** (`bg-danger`): Critical, superuser, destructive
- **Warning** (`bg-warning`): Caution, pending, intermediate
- **Info** (`bg-info`): Informational, regular user type
- **Primary** (`bg-primary`): Count badges, general emphasis

## Modals

### Confirmation Modal Pattern

```html
<!-- Modal HTML -->
<div class="modal fade" id="confirmModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Confirm Action</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to <action> <strong id="itemName"></strong>?</p>
        <p class="text-danger mb-0">
          <i class="bi bi-exclamation-triangle"></i> This action cannot be undone.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <form id="confirmForm" method="POST" style="display: inline;">
          <button type="submit" class="btn btn-danger text-nowrap">
            <i class="bi bi-trash"></i> Delete
          </button>
        </form>
      </div>
    </div>
  </div>
</div>

<!-- JavaScript -->
<script>
  function confirmAction(id, name) {
    document.getElementById('itemName').textContent = name;
    document.getElementById('confirmForm').action = '/resource/' + id + '/action';
    var modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
  }
</script>
```

**When to use:**
- Delete operations
- Bulk actions
- Irreversible changes

**Simple confirmation:**
For simple confirmations, use inline `onclick`:
```html
<button onclick="return confirm('Are you sure?')">Remove</button>
```

## Forms

### Validation

**HTML5 attributes:**
```html
<input type="text" required minlength="3" maxlength="50" pattern="[a-zA-Z0-9_\-]+">
<input type="email" required>
<input type="number" min="0" max="100">
```

**Client-side validation (optional):**
```javascript
document.getElementById('field').addEventListener('input', function() {
  if (/* invalid */) {
    this.setCustomValidity('Error message');
  } else {
    this.setCustomValidity('');
  }
});
```

**Always validate server-side** - never trust client validation alone.

### Form Text (Help)

```html
<div class="form-text">
  Help text explaining requirements or providing guidance.
</div>
```

### Required Fields

Mark required fields with asterisk in label:

```html
<label for="name" class="form-label">Name *</label>
```

## Capability-Based Visibility

### Pattern

Gate UI elements based on user capabilities:

```ejs
<% if (user.is_superuser || user.capabilities.includes('[resource]:write')) { %>
  <a href="/[resource]/new" class="btn btn-primary">Create</a>
<% } %>
```

### Common Capabilities

- `[resource]:read` - View resource
- `[resource]:write` - Create/edit resource
- `[resource]:delete` - Delete resource
- `[resource]:manage-[related]` - Manage relationships
- `[resource]:[action]` - Specific actions (e.g., `users:reset-password`)

### Defense in Depth

Always check capabilities in:
1. **Template** (UI visibility)
2. **Route handler** (server-side enforcement)

```javascript
fastify.get('/resource', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:read', done);
    }
  ]
}, handler);
```

## Date Formatting

### Standard Format

Use `toLocaleString()` for consistency:

```ejs
<%= new Date(item.created_at).toLocaleString() %>
```

Output: `12/13/2025, 3:45:30 PM` (locale-dependent)

### Null Handling

```ejs
<% if (item.last_seen_at) { %>
  <%= new Date(item.last_seen_at).toLocaleString() %>
<% } else { %>
  <span class="text-muted">Never</span>
<% } %>
```

## Null/Empty Value Handling

### Display Patterns

```ejs
<!-- Text fields -->
<%= item.field || 'None' %>
<%= item.field || '' %>

<!-- Dates -->
<% if (item.date) { %>
  <%= new Date(item.date).toLocaleString() %>
<% } else { %>
  <span class="text-muted">Never</span>
<% } %>

<!-- Collections -->
<% if (items.length === 0) { %>
  <p class="text-muted">No items found.</p>
<% } %>
```

## Page Layout

### Standard Structure

Every page follows this structure:

```ejs
<%- include('../partials/head', { title: 'Page Title' }) %>
<body>
  <div class="container-fluid">
    <div class="row">
      <%- include('../partials/header') %>
    </div>
    <div class="row">
      <%- include('../partials/sidebar', { user, navigationMenu, currentPath: '/path' }) %>
      
      <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
        <!-- Page content here -->
      </main>
    </div>
  </div>

  <!-- Toasts if needed -->
  
  <!-- Page-specific scripts if needed -->

  <%- include('../partials/footer') %>
</body>
</html>
```

### Responsive Breakpoints

- **Mobile**: < 768px (sidebar collapses, stacks vertically)
- **Tablet**: 768px - 991px (sidebar visible, narrower)
- **Desktop**: ≥ 992px (full layout)

## Code Values

### Use `<code>` Tag

For technical values like IDs, API keys, tokens:

```html
<dt>User ID:</dt>
<dd><code><%= user.id %></code></dd>
```

## Links and Navigation

### Back Buttons

Always include back navigation:

```html
<a href="/[parent-page]" class="text-decoration-none text-muted me-2">
  <i class="bi bi-arrow-left"></i>
</a>
```

### Internal Links

Use relative paths:

```html
<a href="/users/<%= user.id %>">View User</a>
```

### Link Styling

- **In prose**: Default Bootstrap link styling
- **In navigation**: `.nav-link` class
- **As buttons**: `.btn` class
- **Muted back buttons**: `.text-muted`

## Common Pitfalls

### ❌ Don't

1. Use `forEach` or `for...of` in EJS
2. Use CDN links for Bootstrap (use `/vendor/`)
3. Use inline alerts for action feedback (use toasts)
4. Forget `text-nowrap` on buttons with icons
5. Trust client-side validation alone
6. Show actions without capability checks
7. Forget to handle null/empty values
8. Use `#` for href (use `javascript:void(0)` or actual path)

### ✅ Do

1. Use traditional `for` loops in EJS
2. Serve Bootstrap from npm packages
3. Use toasts for success/error feedback
4. Add `text-nowrap` to all icon buttons
5. Validate on both client and server
6. Check capabilities before showing/executing actions
7. Provide fallback text for null values
8. Use proper navigation URLs

## File Organization

```
src/views/
├── partials/
│   ├── head.ejs       # HTML head, Bootstrap CSS
│   ├── header.ejs     # Top navigation bar
│   ├── sidebar.ejs    # Left sidebar menu
│   └── footer.ejs     # Footer, Bootstrap JS
├── [resource]/
│   ├── list.ejs       # List page
│   ├── detail.ejs     # Detail/view page
│   ├── form.ejs       # Create/edit form
│   └── [related].ejs  # Related entity management
├── dashboard.ejs
└── login.ejs
```

## Related Documents

- [List Pages](ui-style-guide-list-pages.md)
- [Detail/View Pages](ui-style-guide-detail-pages.md)
- [Edit/Create Forms](ui-style-guide-forms.md)
- [Related Entity Management](ui-style-guide-related-entities.md)
- [UI Routing](ui-routing.md)
