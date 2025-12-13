# UI Style Guide: Related Entity Management

## Overview

Related entity management pages handle assigning and removing relationships between items (e.g., users and roles, websites and tags). This guide documents the standard patterns established in the User Roles page (`/users/:id/roles`).

## Master Example

**Reference Implementation:** [src/views/users/roles.ejs](../src/views/users/roles.ejs)  
**Route:** `GET /users/:id/roles`
**Actions:**
- `POST /users/:id/roles/:roleId/assign`
- `POST /users/:id/roles/:roleId/remove`

## Page Structure

### 1. Page Header with Navigation

```html
<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
  <h1 class="h2">
    <a href="/[resource]/<%= targetItem.id %>" class="text-decoration-none text-muted me-2">
      <i class="bi bi-arrow-left"></i>
    </a>
    Manage [Related]: <%= targetItem.name %>
  </h1>
</div>
```

**Key Points:**
- Back button to parent detail page
- Clear indication of what's being managed
- Parent item name in title

### 2. Two-Column Layout

```html
<div class="row">
  <!-- Current Relationships (Left Column) -->
  <div class="col-md-6 mb-4">
    <!-- Card with current relationships -->
  </div>

  <!-- Available Items (Right Column) -->
  <div class="col-md-6 mb-4">
    <!-- Card with available items to assign -->
  </div>

  <!-- Information Section (Full Width, Optional) -->
  <div class="col-md-12 mb-4">
    <!-- Card with reference information -->
  </div>
</div>
```

**Key Points:**
- Equal column split for current/available
- Stacks vertically on mobile
- Optional full-width info section at bottom

### 3. Current Relationships Card

```html
<div class="col-md-6 mb-4">
  <div class="card">
    <div class="card-header bg-primary text-white">
      <h5 class="mb-0"><i class="bi bi-shield-check"></i> Current [Related Items]</h5>
    </div>
    <div class="card-body">
      <!-- Warning for Special Conditions -->
      <% if (targetItem.has_special_status) { %>
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Special Status:</strong> This [item] has [special permissions/conditions].
        </div>
      <% } %>

      <!-- Empty State -->
      <% if (currentRelationships.length === 0) { %>
        <p class="text-muted">
          <i class="bi bi-info-circle"></i> No [related items] assigned to this [resource].
        </p>
      <% } else { %>
        <!-- List of Current Relationships -->
        <div class="list-group">
          <% for (var i = 0; i < currentRelationships.length; i++) { %>
            <% var related = currentRelationships[i]; %>
            <div class="list-group-item d-flex justify-content-between align-items-start">
              <div class="ms-2 me-auto">
                <div class="fw-bold"><%= related.name %></div>
                <% if (related.description) { %>
                  <small class="text-muted"><%= related.description %></small>
                <% } %>
              </div>
              <!-- Remove Button -->
              <form method="POST" 
                    action="/[resource]/<%= targetItem.id %>/[related]/<%= related.id %>/remove" 
                    style="display: inline;">
                <button 
                  type="submit" 
                  class="btn btn-sm btn-outline-danger text-nowrap"
                  onclick="return confirm('Remove [related item] <%= related.name %> from <%= targetItem.name %>?')"
                >
                  <i class="bi bi-x-circle"></i> Remove
                </button>
              </form>
            </div>
          <% } %>
        </div>
      <% } %>
    </div>
  </div>
</div>
```

**Key Points:**
- Primary color for current relationships
- Warning alerts for special conditions (inline, not toast)
- Empty state with helpful message
- List group for clean item display
- Remove button with confirmation
- Use `text-nowrap` on buttons
- Inline form for remove action
- JavaScript `confirm()` for simple confirmation

### 4. Available Items Card

```html
<div class="col-md-6 mb-4">
  <div class="card">
    <div class="card-header bg-success text-white">
      <h5 class="mb-0"><i class="bi bi-plus-circle"></i> Available [Related Items]</h5>
    </div>
    <div class="card-body">
      <% 
        // Filter out already assigned items
        var assignedIds = currentRelationships.map(function(r) { return r.id; });
        var availableItems = allRelatedItems.filter(function(r) { 
          return assignedIds.indexOf(r.id) === -1; 
        });
      %>

      <!-- All Assigned State -->
      <% if (availableItems.length === 0) { %>
        <p class="text-muted">
          <i class="bi bi-check-circle"></i> All [related items] have been assigned to this [resource].
        </p>
      <% } else { %>
        <!-- List of Available Items -->
        <div class="list-group">
          <% for (var i = 0; i < availableItems.length; i++) { %>
            <% var related = availableItems[i]; %>
            <div class="list-group-item d-flex justify-content-between align-items-start">
              <div class="ms-2 me-auto">
                <div class="fw-bold"><%= related.name %></div>
                <% if (related.description) { %>
                  <small class="text-muted"><%= related.description %></small>
                <% } %>
              </div>
              <!-- Assign Button -->
              <form method="POST" 
                    action="/[resource]/<%= targetItem.id %>/[related]/<%= related.id %>/assign" 
                    style="display: inline;">
                <button type="submit" class="btn btn-sm btn-primary text-nowrap">
                  <i class="bi bi-plus-circle"></i> Assign
                </button>
              </form>
            </div>
          <% } %>
        </div>
      <% } %>
    </div>
  </div>
</div>
```

**Key Points:**
- Success/green color for available items
- Filter out already assigned items (client-side in template)
- Empty state when all assigned
- Assign button with primary color
- Use `text-nowrap` on buttons
- No confirmation needed for assign action

### 5. Information/Reference Section (Optional)

```html
<div class="col-md-12 mb-4">
  <div class="card">
    <div class="card-header bg-info text-white">
      <h5 class="mb-0"><i class="bi bi-info-circle"></i> [Related Item] Information</h5>
    </div>
    <div class="card-body">
      <div class="row">
        <% for (var i = 0; i < allRelatedItems.length; i++) { %>
          <% var related = allRelatedItems[i]; %>
          <div class="col-md-6 mb-3">
            <div class="card">
              <div class="card-body">
                <h6 class="card-title">
                  <i class="bi bi-shield"></i> <%= related.name %>
                </h6>
                <% if (related.description) { %>
                  <p class="card-text small"><%= related.description %></p>
                <% } %>
                
                <!-- Additional Info (e.g., capabilities, permissions) -->
                <% if (related.attributes && related.attributes.length > 0) { %>
                  <p class="card-text small mb-0">
                    <strong>Attributes:</strong>
                    <br>
                    <% for (var j = 0; j < Math.min(5, related.attributes.length); j++) { %>
                      <code class="small"><%= related.attributes[j].name %></code><% if (j < Math.min(4, related.attributes.length - 1)) { %>, <% } %>
                    <% } %>
                    <% if (related.attributes.length > 5) { %>
                      <br><small class="text-muted">... and <%= related.attributes.length - 5 %> more</small>
                    <% } %>
                  </p>
                <% } %>
              </div>
            </div>
          </div>
        <% } %>
      </div>
    </div>
  </div>
</div>
```

**Key Points:**
- Full-width info section
- Info/blue color for reference data
- Two-column grid of info cards
- Show limited items (first 5) with "and X more"
- Use `<code>` tags for technical attributes
- Helps users understand what they're assigning

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

## Server-Side Implementation

### GET Handler (Load Page)

```javascript
fastify.get('/[resource]/:id/[related]', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:manage-[related]', done);
    }
  ]
}, async (request, reply) => {
  const { id } = request.params;
  const { success, error } = request.query;

  // Get parent item
  const targetItem = await ParentModel.getById(id);
  if (!targetItem) {
    return reply.code(404).view('errors/404');
  }

  // Get current relationships
  const currentRelationships = await RelationshipService.getRelated(id);

  // Get all related items (with additional info)
  const allRelatedItems = await RelatedModel.listWithAttributes();

  return reply.view('[resource]/[related]', {
    user: request.user,
    navigationMenu: getNavigationMenu(request.user),
    currentPath: '/[resource]',
    targetItem,
    currentRelationships,
    allRelatedItems,
    success,
    error,
    config
  });
});
```

### POST Handler (Assign)

```javascript
fastify.post('/[resource]/:id/[related]/:relatedId/assign', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:manage-[related]', done);
    }
  ]
}, async (request, reply) => {
  const { id, relatedId } = request.params;

  try {
    // Check parent exists
    const targetItem = await ParentModel.getById(id);
    if (!targetItem) {
      return reply.code(404).view('errors/404');
    }

    // Check related item exists
    const relatedItem = await RelatedModel.getById(relatedId);
    if (!relatedItem) {
      return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                           encodeURIComponent('[Related item] not found'));
    }

    // Check if already assigned
    const existing = await RelationshipService.exists(id, relatedId);
    if (existing) {
      return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                           encodeURIComponent('[Related item] is already assigned'));
    }

    // Assign
    await RelationshipService.assign(id, relatedId);

    // Audit log
    await auditLog.log({
      user_id: request.user.id,
      action: '[resource].[related].assign',
      resource_type: '[resource]',
      resource_id: id,
      details: { related_id: relatedId, related_name: relatedItem.name }
    });

    return reply.redirect(`/[resource]/${id}/[related]?success=` + 
                         encodeURIComponent(`${relatedItem.name} assigned successfully`));
  } catch (error) {
    return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                         encodeURIComponent(error.message));
  }
});
```

### POST Handler (Remove)

```javascript
fastify.post('/[resource]/:id/[related]/:relatedId/remove', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:manage-[related]', done);
    }
  ]
}, async (request, reply) => {
  const { id, relatedId } = request.params;

  try {
    // Check parent exists
    const targetItem = await ParentModel.getById(id);
    if (!targetItem) {
      return reply.code(404).view('errors/404');
    }

    // Get related item for name
    const relatedItem = await RelatedModel.getById(relatedId);
    if (!relatedItem) {
      return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                           encodeURIComponent('[Related item] not found'));
    }

    // Check if assigned
    const exists = await RelationshipService.exists(id, relatedId);
    if (!exists) {
      return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                           encodeURIComponent('[Related item] is not assigned'));
    }

    // Remove
    await RelationshipService.remove(id, relatedId);

    // Audit log
    await auditLog.log({
      user_id: request.user.id,
      action: '[resource].[related].remove',
      resource_type: '[resource]',
      resource_id: id,
      details: { related_id: relatedId, related_name: relatedItem.name }
    });

    return reply.redirect(`/[resource]/${id}/[related]?success=` + 
                         encodeURIComponent(`${relatedItem.name} removed successfully`));
  } catch (error) {
    return reply.redirect(`/[resource]/${id}/[related]?error=` + 
                         encodeURIComponent(error.message));
  }
});
```

**Key Points:**
- Check both parent and related items exist
- Verify relationship state before assign/remove
- Use service layer for relationship management
- Audit log all relationship changes
- Redirect back with success/error message
- Use related item name in messages for clarity

## Best Practices

1. **Two-Column Layout**: Current vs Available for clear organization
2. **Filter Available**: Don't show already-assigned items in available list
3. **Text Nowrap**: Use on all buttons with icons
4. **Confirmation**: Require confirmation for remove, not for assign
5. **Toast Notifications**: Use for action feedback
6. **Inline Alerts**: Use for warnings/special conditions (not dismissible)
7. **Empty States**: Handle both "none assigned" and "all assigned" states
8. **Back Navigation**: Always link to parent detail page
9. **Audit Logging**: Log all assign/remove operations
10. **Information Section**: Help users understand what they're managing
11. **Capability Gating**: Check `[resource]:manage-[related]` permission
12. **Relationship Validation**: Check for duplicates, verify existence

## Common Variations

### Many-to-Many with Metadata

When relationships have additional data (e.g., join date, priority):

```html
<div class="list-group-item d-flex justify-content-between align-items-start">
  <div class="ms-2 me-auto">
    <div class="fw-bold"><%= related.name %></div>
    <small class="text-muted">
      Assigned: <%= new Date(related.assigned_at).toLocaleString() %>
    </small>
  </div>
  <form method="POST" action="/[resource]/<%= targetItem.id %>/[related]/<%= related.id %>/remove" style="display: inline;">
    <button type="submit" class="btn btn-sm btn-outline-danger text-nowrap"
            onclick="return confirm('Remove?')">
      <i class="bi bi-x-circle"></i> Remove
    </button>
  </form>
</div>
```

### With Search/Filter

For large lists of available items, add search:

```html
<div class="mb-3">
  <input type="text" class="form-control" id="searchAvailable" 
         placeholder="Search available [items]...">
</div>
<div id="availableList" class="list-group">
  <!-- Items here -->
</div>

<script>
  document.getElementById('searchAvailable')?.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const items = document.querySelectorAll('#availableList .list-group-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? '' : 'none';
    });
  });
</script>
```

### Hierarchical Relationships

For nested relationships (e.g., categories with subcategories), use nested lists or tree views.

### Bulk Assignment

Add checkboxes and bulk assign button:

```html
<form method="POST" action="/[resource]/<%= targetItem.id %>/[related]/bulk-assign">
  <div class="list-group">
    <% for (var i = 0; i < availableItems.length; i++) { %>
      <label class="list-group-item">
        <input type="checkbox" name="related_ids[]" value="<%= availableItems[i].id %>">
        <%= availableItems[i].name %>
      </label>
    <% } %>
  </div>
  <button type="submit" class="btn btn-primary mt-3 text-nowrap">
    <i class="bi bi-plus-circle"></i> Assign Selected
  </button>
</form>
```

## Related Patterns

- [Detail/View Pages](ui-style-guide-detail-pages.md)
- [List Pages](ui-style-guide-list-pages.md)
- [UI Conventions](ui-style-guide-conventions.md)
