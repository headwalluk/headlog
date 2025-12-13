# UI Style Guide: Detail/View Pages

## Overview

Detail pages display comprehensive information about a single item, including related data, activity history, and contextual actions. This guide documents the standard patterns established in the User detail page (`/users/:id`).

## Master Example

**Reference Implementation:** [src/views/users/detail.ejs](../src/views/users/detail.ejs)  
**Route:** `GET /users/:id`

## Page Structure

### 1. Page Header with Navigation

```html
<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
  <h1 class="h2">
    <a href="/[resource]" class="text-decoration-none text-muted me-2">
      <i class="bi bi-arrow-left"></i>
    </a>
    [Resource Name/Title]
  </h1>
  <div class="btn-toolbar mb-2 mb-md-0">
    <% if (user.is_superuser || user.capabilities.includes('[resource]:write')) { %>
      <a href="/[resource]/<%= item.id %>/edit" class="btn btn-sm btn-primary text-nowrap me-2">
        <i class="bi bi-pencil"></i> Edit
      </a>
    <% } %>
    <% if (user.is_superuser || user.capabilities.includes('[resource]:delete')) { %>
      <button type="button" class="btn btn-sm btn-danger text-nowrap"
              onclick="confirmDelete('<%= item.id %>', '<%= item.name %>')">
        <i class="bi bi-trash"></i> Delete
      </button>
    <% } %>
  </div>
</div>
```

**Key Points:**
- Back button (arrow icon) links to list page
- Item name/identifier as title
- Action buttons in toolbar (capability-gated)
- Use `text-nowrap` on all buttons with icons
- Responsive wrapping on small screens

### 2. Information Cards

Use Bootstrap cards to organize information into logical sections:

```html
<div class="row">
  <!-- Primary Information Card -->
  <div class="col-md-6 mb-4">
    <div class="card">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0"><i class="bi bi-info-circle"></i> [Section Title]</h5>
      </div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">[Field Label]:</dt>
          <dd class="col-sm-8"><%= item.field1 %></dd>
          
          <dt class="col-sm-4">[Field Label]:</dt>
          <dd class="col-sm-8"><%= item.field2 %></dd>
          
          <dt class="col-sm-4">Status:</dt>
          <dd class="col-sm-8">
            <% if (item.is_active) { %>
              <span class="badge bg-success">Active</span>
            <% } else { %>
              <span class="badge bg-secondary">Inactive</span>
            <% } %>
          </dd>
          
          <dt class="col-sm-4">Type:</dt>
          <dd class="col-sm-8">
            <% if (item.is_special) { %>
              <span class="badge bg-warning">Special</span>
            <% } else { %>
              <span class="badge bg-info">Regular</span>
            <% } %>
          </dd>
          
          <dt class="col-sm-4">ID:</dt>
          <dd class="col-sm-8"><code><%= item.id %></code></dd>
        </dl>
      </div>
    </div>
  </div>

  <!-- Activity/Metadata Card -->
  <div class="col-md-6 mb-4">
    <div class="card">
      <div class="card-header bg-info text-white">
        <h5 class="mb-0"><i class="bi bi-clock-history"></i> Activity</h5>
      </div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">Last Activity:</dt>
          <dd class="col-sm-8">
            <% if (item.last_activity_at) { %>
              <%= new Date(item.last_activity_at).toLocaleString() %>
              <% if (item.last_activity_ip) { %>
                <br><small class="text-muted">from <%= item.last_activity_ip %></small>
              <% } %>
            <% } else { %>
              <span class="text-muted">Never</span>
            <% } %>
          </dd>
          
          <dt class="col-sm-4">Created:</dt>
          <dd class="col-sm-8">
            <%= new Date(item.created_at).toLocaleString() %>
          </dd>
          
          <dt class="col-sm-4">Updated:</dt>
          <dd class="col-sm-8">
            <%= new Date(item.updated_at).toLocaleString() %>
          </dd>
        </dl>
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- Two-column layout (responsive, stacks on mobile)
- Use semantic card header colors
- Definition lists (`<dl>`) for label-value pairs
- Bootstrap's row/column grid within dl for alignment
- Badges for status/type indicators
- `<code>` tags for IDs, technical values
- Handle null values with conditional rendering
- Format dates consistently with `toLocaleString()`

### 3. Related Data Sections

Display related entities with links to manage them:

```html
<div class="row">
  <div class="col-md-12 mb-4">
    <div class="card">
      <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
        <h5 class="mb-0"><i class="bi bi-collection"></i> [Related Items]</h5>
        <% if (user.is_superuser || user.capabilities.includes('[related]:manage')) { %>
          <a href="/[resource]/<%= item.id %>/[related]" class="btn btn-sm btn-light text-nowrap">
            <i class="bi bi-gear"></i> Manage
          </a>
        <% } %>
      </div>
      <div class="card-body">
        <% if (item.special_condition) { %>
          <div class="alert alert-warning">
            <i class="bi bi-exclamation-triangle"></i>
            <strong>Warning:</strong> [Special condition message]
          </div>
        <% } %>

        <% if (relatedItems && relatedItems.length > 0) { %>
          <ul class="list-group">
            <% for (var i = 0; i < relatedItems.length; i++) { %>
              <% var related = relatedItems[i]; %>
              <li class="list-group-item">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong><%= related.name %></strong>
                    <% if (related.description) { %>
                      <br><small class="text-muted"><%= related.description %></small>
                    <% } %>
                  </div>
                  <span class="badge bg-primary"><%= related.count || 0 %></span>
                </div>
              </li>
            <% } %>
          </ul>
        <% } else { %>
          <p class="text-muted mb-0">
            <i class="bi bi-info-circle"></i> No [related items] assigned.
          </p>
        <% } %>
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- Full-width card for related sections
- Manage button in card header (capability-gated)
- Warning alerts for special conditions (inline, not toast)
- List groups for related items
- Empty state with helpful message
- Use badges for counts or status

### 4. Inline Forms

Forms for single-purpose actions within the detail page:

```html
<div class="row">
  <div class="col-md-6 mb-4">
    <div class="card">
      <div class="card-header bg-warning text-dark">
        <h5 class="mb-0"><i class="bi bi-key"></i> [Action Title]</h5>
      </div>
      <div class="card-body">
        <% if (user.is_superuser || user.capabilities.includes('[resource]:[action]')) { %>
          <form method="POST" action="/[resource]/<%= item.id %>/[action]">
            <div class="mb-3">
              <label for="field1" class="form-label">[Field Label]</label>
              <input type="text" class="form-control" id="field1" name="field1" 
                     minlength="12" required>
              <div class="form-text">
                [Help text for this field]
              </div>
            </div>
            
            <div class="mb-3">
              <label for="field2" class="form-label">[Confirm Field]</label>
              <input type="text" class="form-control" id="field2" name="field2" 
                     minlength="12" required>
            </div>
            
            <button type="submit" class="btn btn-warning text-nowrap">
              <i class="bi bi-[icon]"></i> [Action Button]
            </button>
          </form>
          
          <script>
            // Client-side validation
            document.getElementById('field2')?.addEventListener('input', function() {
              var field1 = document.getElementById('field1').value;
              var field2 = this.value;
              if (field1 !== field2) {
                this.setCustomValidity('[Fields] do not match');
              } else {
                this.setCustomValidity('');
              }
            });
          </script>
        <% } else { %>
          <p class="text-muted mb-0">
            <i class="bi bi-lock"></i> You do not have permission to perform this action.
          </p>
        <% } %>
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- Inline forms for single-purpose actions
- Use warning color for sensitive actions
- Capability check shows permission message
- Client-side validation for better UX
- Form text for helpful hints
- Submit button uses action-appropriate color

### 5. Delete Confirmation Modal

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
        <% if (item.has_dependencies) { %>
          <div class="alert alert-warning">
            <i class="bi bi-exclamation-triangle"></i>
            This will also delete [X related items].
          </div>
        <% } %>
        <p class="text-danger mb-0">
          <i class="bi bi-exclamation-triangle"></i> This action cannot be undone.
        </p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <form id="deleteForm" method="POST" style="display: inline;">
          <button type="submit" class="btn btn-danger text-nowrap">
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

### 6. Toast Notifications

```html
<!-- Toast Container -->
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
  // Show toasts on page load
  document.addEventListener('DOMContentLoaded', function() {
    const successToast = document.getElementById('successToast');
    const errorToast = document.getElementById('errorToast');
    
    if (successToast) {
      const toast = new bootstrap.Toast(successToast, {
        autohide: true,
        delay: 5000
      });
      toast.show();
    }
    
    if (errorToast) {
      const toast = new bootstrap.Toast(errorToast, {
        autohide: true,
        delay: 5000
      });
      toast.show();
    }
  });
</script>
```

**Key Points:**
- Position: bottom-left (`bottom-0 start-0`)
- Auto-dismiss after 5 seconds
- Success (green) and error (red) variants
- Use toasts for action feedback, not inline alerts

## Server-Side Implementation

### Route Handler Pattern

```javascript
fastify.get('/[resource]/:id', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:read', done);
    }
  ]
}, async (request, reply) => {
  const { id } = request.params;
  const { success, error } = request.query;

  // Get item
  const item = await Model.getById(id);
  if (!item) {
    return reply.code(404).view('errors/404', {
      user: request.user,
      message: '[Resource] not found'
    });
  }

  // Get related data
  const relatedItems = await Model.getRelated(id);

  // Check capabilities for conditional rendering
  const canEdit = request.user.is_superuser || 
                  request.user.capabilities.includes('[resource]:write');
  const canDelete = request.user.is_superuser || 
                    request.user.capabilities.includes('[resource]:delete');

  return reply.view('resource/detail', {
    user: request.user,
    navigationMenu: getNavigationMenu(request.user),
    currentPath: '/[resource]',
    item,
    relatedItems,
    canEdit,
    canDelete,
    success,
    error,
    config
  });
});
```

**Key Points:**
- Load item and 404 if not found
- Load related data in parallel where possible
- Pass capability flags for template logic
- Success/error from query params (set by action handlers)

### Action Handler Pattern

```javascript
fastify.post('/[resource]/:id/[action]', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:[action]', done);
    }
  ]
}, async (request, reply) => {
  const { id } = request.params;
  const { field1, field2 } = request.body;

  try {
    // Validate
    if (field1 !== field2) {
      return reply.redirect(`/[resource]/${id}?error=${encodeURIComponent('[Fields] do not match')}`);
    }

    // Perform action
    await Model.performAction(id, field1);

    // Audit log
    await auditLog.log({
      user_id: request.user.id,
      action: '[resource].[action]',
      resource_type: '[resource]',
      resource_id: id,
      details: { /* ... */ }
    });

    return reply.redirect(`/[resource]/${id}?success=${encodeURIComponent('[Action] completed successfully')}`);
  } catch (error) {
    return reply.redirect(`/[resource]/${id}?error=${encodeURIComponent(error.message)}`);
  }
});
```

**Key Points:**
- Validate input server-side
- Perform action with error handling
- Log to audit trail
- Redirect with success/error message in query params
- Use `encodeURIComponent()` for message safety

## Best Practices

1. **Logical Grouping**: Organize related information into cards
2. **Two-Column Layout**: Use for better space utilization (responsive)
3. **Capability Gating**: Check permissions before showing actions
4. **Empty States**: Handle missing related data gracefully
5. **Toast Notifications**: Use for action feedback (not inline alerts for success/error)
6. **Inline Alerts**: Use for contextual warnings/info (not dismissible)
7. **Text Nowrap**: Always use on buttons with icons
8. **Date Formatting**: Use consistent `toLocaleString()` format
9. **Null Handling**: Show "Never" or "None" for null values
10. **Back Navigation**: Always provide way back to list

## Common Variations

### Tabbed Interface
For items with many sections, use Bootstrap tabs:

```html
<ul class="nav nav-tabs" id="detailTabs" role="tablist">
  <li class="nav-item">
    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#info">Information</button>
  </li>
  <li class="nav-item">
    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#activity">Activity</button>
  </li>
</ul>
<div class="tab-content">
  <div class="tab-pane fade show active" id="info">...</div>
  <div class="tab-pane fade" id="activity">...</div>
</div>
```

### Timeline View
For activity history, use vertical timeline layout with cards.

### Embedded Lists
For many related items, embed a mini list-table within a card.

## Related Patterns

- [List Pages](ui-style-guide-list-pages.md)
- [Edit/Create Forms](ui-style-guide-forms.md)
- [Related Entity Management](ui-style-guide-related-entities.md)
- [UI Conventions](ui-style-guide-conventions.md)
