# UI Style Guide: List Pages

## Overview

List pages display collections of items with search, filtering, and pagination capabilities. This guide documents the standard patterns established in the Users list page (`/users`).

## Master Example

**Reference Implementation:** [src/views/users/list.ejs](../src/views/users/list.ejs)  
**Route:** `GET /users`

## Page Structure

### 1. Page Header

```html
<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
  <h1 class="h2">
    <i class="bi bi-[icon]"></i> [Page Title]
  </h1>
  <div class="btn-toolbar mb-2 mb-md-0">
    <% if (user.is_superuser || user.capabilities.includes('[resource]:write')) { %>
      <a href="/[resource]/new" class="btn btn-sm btn-primary">
        <i class="bi bi-plus-circle"></i> Create [Resource]
      </a>
    <% } %>
  </div>
</div>
```

**Key Points:**
- Page title with relevant icon (h2 size)
- Create button in toolbar (capability-gated)
- Use `text-nowrap` class on buttons with icons
- Bootstrap utility classes for responsive layout

### 2. Search and Filter Bar

```html
<div class="row mb-3">
  <div class="col-md-12">
    <form method="GET" action="/[resource]" class="row g-2">
      <!-- Search Input -->
      <div class="col-md-6">
        <div class="input-group">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input type="text" class="form-control" name="search" 
                 placeholder="Search by [field] or [field]" 
                 value="<%= search || '' %>">
        </div>
      </div>
      
      <!-- Filter Dropdown -->
      <div class="col-md-3">
        <select class="form-select" name="status">
          <option value="">All [Statuses]</option>
          <option value="active" <%= status === 'active' ? 'selected' : '' %>>Active</option>
          <option value="inactive" <%= status === 'inactive' ? 'selected' : '' %>>Inactive</option>
        </select>
      </div>
      
      <!-- Submit Button -->
      <div class="col-md-3">
        <button type="submit" class="btn btn-primary w-100 text-nowrap">
          <i class="bi bi-funnel"></i> Filter
        </button>
      </div>
    </form>
  </div>
</div>
```

**Key Points:**
- GET form (preserves state in URL)
- Search input with icon in input-group
- Dropdowns for filters (preserve selected state)
- Submit button spans full width on mobile
- Use `text-nowrap` on buttons with icons

### 3. Results Summary

```html
<div class="mb-2">
  <p class="text-muted">
    Showing <%= offset + 1 %> to <%= Math.min(offset + limit, totalCount) %> 
    of <%= totalCount %> [resources]
    <% if (search) { %>
      matching "<%= search %>"
    <% } %>
  </p>
</div>
```

### 4. Results Table

```html
<div class="table-responsive">
  <table class="table table-striped table-hover">
    <thead>
      <tr>
        <th>[Column 1]</th>
        <th>[Column 2]</th>
        <th>[Status/Type]</th>
        <th>[Date/Time]</th>
        <th class="text-end">Actions</th>
      </tr>
    </thead>
    <tbody>
      <% for (var i = 0; i < items.length; i++) { %>
        <% var item = items[i]; %>
        <tr>
          <td><%= item.field1 %></td>
          <td><%= item.field2 %></td>
          <td>
            <% if (item.is_active) { %>
              <span class="badge bg-success">Active</span>
            <% } else { %>
              <span class="badge bg-secondary">Inactive</span>
            <% } %>
          </td>
          <td>
            <% if (item.last_action_at) { %>
              <%= new Date(item.last_action_at).toLocaleString() %>
            <% } else { %>
              <span class="text-muted">Never</span>
            <% } %>
          </td>
          <td class="text-end">
            <a href="/[resource]/<%= item.id %>" class="btn btn-sm btn-info text-nowrap">
              <i class="bi bi-eye"></i> View
            </a>
            <% if (user.is_superuser || user.capabilities.includes('[resource]:write')) { %>
              <a href="/[resource]/<%= item.id %>/edit" class="btn btn-sm btn-primary text-nowrap">
                <i class="bi bi-pencil"></i> Edit
              </a>
            <% } %>
            <% if (user.is_superuser || user.capabilities.includes('[resource]:delete')) { %>
              <button type="button" class="btn btn-sm btn-danger text-nowrap"
                      onclick="confirmDelete('<%= item.id %>', '<%= item.name %>')">
                <i class="bi bi-trash"></i> Delete
              </button>
            <% } %>
          </td>
        </tr>
      <% } %>
    </tbody>
  </table>
</div>
```

**Key Points:**
- Use `table-responsive` wrapper for mobile scrolling
- `table-striped table-hover` for better UX
- Badges for status indicators (use semantic colors)
- Actions column right-aligned
- All action buttons use `text-nowrap` class
- Gate actions based on capabilities
- Traditional `for` loops (EJS limitation - no forEach/for...of)

### 5. Empty State

```html
<% if (items.length === 0) { %>
  <div class="alert alert-info" role="alert">
    <i class="bi bi-info-circle"></i>
    <% if (search || status) { %>
      No [resources] found matching your search criteria.
    <% } else { %>
      No [resources] have been created yet.
      <% if (user.is_superuser || user.capabilities.includes('[resource]:write')) { %>
        <a href="/[resource]/new" class="alert-link">Create one now</a>.
      <% } %>
    <% } %>
  </div>
<% } %>
```

**Key Points:**
- Different messages for filtered vs empty states
- Provide action link when appropriate
- Use info alert (not a toast - this is contextual)

### 6. Pagination

```html
<% if (totalPages > 1) { %>
  <nav aria-label="Page navigation">
    <ul class="pagination justify-content-center">
      <!-- Previous Button -->
      <li class="page-item <%= currentPage === 1 ? 'disabled' : '' %>">
        <a class="page-link" href="?page=<%= currentPage - 1 %>&search=<%= encodeURIComponent(search || '') %>&status=<%= status || '' %>">
          Previous
        </a>
      </li>

      <!-- Page Numbers with Ellipsis -->
      <% 
        var startPage = Math.max(1, currentPage - 2);
        var endPage = Math.min(totalPages, currentPage + 2);
      %>
      
      <% if (startPage > 1) { %>
        <li class="page-item">
          <a class="page-link" href="?page=1&search=<%= encodeURIComponent(search || '') %>&status=<%= status || '' %>">1</a>
        </li>
        <% if (startPage > 2) { %>
          <li class="page-item disabled"><span class="page-link">...</span></li>
        <% } %>
      <% } %>

      <% for (var p = startPage; p <= endPage; p++) { %>
        <li class="page-item <%= currentPage === p ? 'active' : '' %>">
          <a class="page-link" href="?page=<%= p %>&search=<%= encodeURIComponent(search || '') %>&status=<%= status || '' %>">
            <%= p %>
          </a>
        </li>
      <% } %>

      <% if (endPage < totalPages) { %>
        <% if (endPage < totalPages - 1) { %>
          <li class="page-item disabled"><span class="page-link">...</span></li>
        <% } %>
        <li class="page-item">
          <a class="page-link" href="?page=<%= totalPages %>&search=<%= encodeURIComponent(search || '') %>&status=<%= status || '' %>">
            <%= totalPages %>
          </a>
        </li>
      <% } %>

      <!-- Next Button -->
      <li class="page-item <%= currentPage === totalPages ? 'disabled' : '' %>">
        <a class="page-link" href="?page=<%= currentPage + 1 %>&search=<%= encodeURIComponent(search || '') %>&status=<%= status || '' %>">
          Next
        </a>
      </li>
    </ul>
  </nav>
<% } %>
```

**Key Points:**
- Show ellipsis when there are many pages
- Preserve search and filter params in pagination links
- Disable previous/next when at boundaries
- Center-aligned pagination
- Show 5 pages at a time (current ±2)

### 7. Delete Confirmation Modal

```html
<!-- Delete Confirmation Modal -->
<div class="modal fade" id="deleteModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Confirm Delete</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete <strong id="deleteItemName"></strong>?</p>
        <p class="text-danger mb-0">
          <i class="bi bi-exclamation-triangle"></i> This action cannot be undone.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <form id="deleteForm" method="POST" style="display: inline;">
          <button type="submit" class="btn btn-danger">
            <i class="bi bi-trash"></i> Delete
          </button>
        </form>
      </div>
    </div>
  </div>
</div>

<script>
  function confirmDelete(id, name) {
    document.getElementById('deleteItemName').textContent = name;
    document.getElementById('deleteForm').action = '/[resource]/' + id + '/delete';
    var deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
  }
</script>
```

**Key Points:**
- Bootstrap modal for confirmation
- Dynamic content (item name, form action)
- Warning message about irreversibility
- Use danger color for delete button

## Server-Side Implementation

### Route Handler Pattern

```javascript
fastify.get('/[resource]', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:read', done);
    }
  ]
}, async (request, reply) => {
  const { search = '', status = '', page = '1' } = request.query;
  const limit = 25;
  const currentPage = parseInt(page) || 1;
  const offset = (currentPage - 1) * limit;

  // Build WHERE clause
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(field1 LIKE ? OR field2 LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status === 'active') {
    conditions.push('is_active = ?');
    params.push(1);
  } else if (status === 'inactive') {
    conditions.push('is_active = ?');
    params.push(0);
  }

  const whereClause = conditions.length > 0 
    ? 'WHERE ' + conditions.join(' AND ') 
    : '';

  // Get total count
  const [countResult] = await db.query(
    `SELECT COUNT(*) as total FROM resources ${whereClause}`,
    params
  );
  const totalCount = countResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  // Get paginated results
  const [items] = await db.query(
    `SELECT * FROM resources ${whereClause} 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return reply.view('resource/list', {
    user: request.user,
    navigationMenu: getNavigationMenu(request.user),
    currentPath: '/[resource]',
    items,
    search,
    status,
    currentPage,
    totalPages,
    totalCount,
    limit,
    offset,
    config
  });
});
```

**Key Points:**
- Capability check in preHandler
- Extract query params with defaults
- Build dynamic WHERE clause
- Get total count for pagination
- Pass all state to template for preservation

## Best Practices

1. **Use Traditional For Loops**: EJS doesn't support `forEach()` or `for...of` - use `for (var i = 0; i < arr.length; i++)`
2. **Preserve Filter State**: Include all filter params in pagination links
3. **Capability-Based Visibility**: Gate all write/delete actions
4. **Responsive Design**: Use Bootstrap grid and responsive utilities
5. **Empty States**: Provide helpful messages and next actions
6. **Text Nowrap**: Always use `text-nowrap` class on buttons with icons
7. **Semantic Colors**: Use Bootstrap's semantic color scheme for badges/buttons
8. **Accessibility**: Include aria labels and proper form labels

## Common Variations

### Without Search
Remove the search input, simplify the form to just filters.

### Without Filters
Remove filter dropdowns, keep search only.

### Custom Row Actions
Add specific actions relevant to the resource (e.g., "Reset Password", "Send Email").

### Bulk Actions
Add checkboxes and bulk action toolbar (not yet implemented in master example).

## Related Patterns

- [Detail/View Pages](ui-style-guide-detail-pages.md)
- [Edit/Create Forms](ui-style-guide-forms.md)
- [UI Conventions](ui-style-guide-conventions.md)
