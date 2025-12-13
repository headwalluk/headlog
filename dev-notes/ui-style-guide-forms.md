# UI Style Guide: Edit/Create Forms

## Overview

Form pages handle both creating new items and editing existing ones using a single template. This guide documents the standard patterns established in the User form page (`/users/new` and `/users/:id/edit`).

## Master Example

**Reference Implementation:** [src/views/users/form.ejs](../src/views/users/form.ejs)  
**Routes:** 
- `GET /users/new` → `POST /users/create`
- `GET /users/:id/edit` → `POST /users/:id/update`

## Page Structure

### 1. Page Header

```html
<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
  <h1 class="h2">
    <a href="<%= targetItem ? '/[resource]/' + targetItem.id : '/[resource]' %>" class="text-decoration-none text-muted me-2">
      <i class="bi bi-arrow-left"></i>
    </a>
    <%= targetItem ? 'Edit [Resource]: ' + targetItem.name : 'Create New [Resource]' %>
  </h1>
</div>
```

**Key Points:**
- Back button links to detail page (edit) or list (create)
- Dynamic title based on mode
- Check for `targetItem` to determine mode

### 2. Form Layout (Two Columns)

```html
<div class="row">
  <!-- Form Fields (Left Column) -->
  <div class="col-md-8">
    <form method="POST" 
          action="<%= targetItem ? '/[resource]/' + targetItem.id + '/update' : '/[resource]/create' %>" 
          id="[resource]Form">
      
      <!-- Card sections for logical grouping -->
      
    </form>
  </div>

  <!-- Help Sidebar (Right Column) -->
  <div class="col-md-4">
    <!-- Help cards -->
  </div>
</div>
```

**Key Points:**
- 8/4 column split (form/help)
- Single form element with dynamic action
- Stacks vertically on mobile
- Unique form ID for JavaScript

### 3. Form Sections (Cards)

Organize related fields into cards:

```html
<div class="card mb-4">
  <div class="card-header bg-primary text-white">
    <h5 class="mb-0"><i class="bi bi-person-circle"></i> Basic Information</h5>
  </div>
  <div class="card-body">
    
    <!-- Text Input -->
    <div class="mb-3">
      <label for="name" class="form-label">Name *</label>
      <input type="text" 
             class="form-control" 
             id="name" 
             name="name" 
             value="<%= targetItem ? targetItem.name : '' %>"
             pattern="[a-zA-Z0-9_\-]+"
             minlength="3"
             maxlength="50"
             required>
      <div class="form-text">
        3-50 characters. Letters, numbers, underscore, and hyphen only.
      </div>
    </div>

    <!-- Email Input -->
    <div class="mb-3">
      <label for="email" class="form-label">Email *</label>
      <input type="email" 
             class="form-control" 
             id="email" 
             name="email" 
             value="<%= targetItem ? targetItem.email : '' %>"
             required>
    </div>

    <!-- Checkbox -->
    <div class="mb-3">
      <div class="form-check">
        <input class="form-check-input" 
               type="checkbox" 
               id="is_active" 
               name="is_active" 
               value="1"
               <%= (targetItem ? targetItem.is_active : true) ? 'checked' : '' %>>
        <label class="form-check-label" for="is_active">
          Active
        </label>
      </div>
      <div class="form-text">
        Inactive [resources] cannot [perform action].
      </div>
    </div>

    <!-- Conditional Field (Capability-Gated) -->
    <% if (user.is_superuser) { %>
      <div class="mb-3">
        <div class="form-check">
          <input class="form-check-input" 
                 type="checkbox" 
                 id="is_special" 
                 name="is_special" 
                 value="1"
                 <%= targetItem && targetItem.is_special ? 'checked' : '' %>>
          <label class="form-check-label" for="is_special">
            Special Status
          </label>
        </div>
        <div class="form-text text-warning">
          <i class="bi bi-exclamation-triangle"></i>
          Only superusers can modify this setting.
        </div>
      </div>
    <% } %>

  </div>
</div>
```

**Key Points:**
- Group related fields in cards
- Use semantic card header colors
- Required fields marked with *
- Form text for guidance
- Pre-fill values in edit mode: `<%= targetItem ? targetItem.field : '' %>`
- Default checked state for new items: `<%= (targetItem ? targetItem.is_active : true) ? 'checked' : '' %>`
- Gate sensitive fields by capability
- HTML5 validation attributes (pattern, minlength, required)

### 4. Create-Only Fields

Fields that only appear when creating (e.g., passwords):

```html
<% if (!targetItem) { %>
  <div class="card mb-4">
    <div class="card-header bg-warning text-dark">
      <h5 class="mb-0"><i class="bi bi-key"></i> Authentication</h5>
    </div>
    <div class="card-body">
      
      <div class="mb-3">
        <label for="password" class="form-label">Password *</label>
        <input type="password" 
               class="form-control" 
               id="password" 
               name="password" 
               minlength="12"
               required>
        <div class="form-text">
          Minimum 12 characters. Must include uppercase, lowercase, number, and special character.
        </div>
      </div>

      <div class="mb-3">
        <label for="confirmPassword" class="form-label">Confirm Password *</label>
        <input type="password" 
               class="form-control" 
               id="confirmPassword" 
               name="confirmPassword" 
               minlength="12"
               required>
      </div>

    </div>
  </div>

  <script>
    // Client-side password matching validation
    const passwordField = document.getElementById('password');
    const confirmField = document.getElementById('confirmPassword');

    if (passwordField && confirmField) {
      confirmField.addEventListener('input', function() {
        if (passwordField.value !== confirmField.value) {
          this.setCustomValidity('Passwords do not match');
        } else {
          this.setCustomValidity('');
        }
      });

      passwordField.addEventListener('input', function() {
        if (confirmField.value && passwordField.value !== confirmField.value) {
          confirmField.setCustomValidity('Passwords do not match');
        } else {
          confirmField.setCustomValidity('');
        }
      });
    }

    // Form submission validation
    document.getElementById('[resource]Form').addEventListener('submit', function(e) {
      if (confirmField && passwordField.value !== confirmField.value) {
        e.preventDefault();
        alert('Passwords do not match');
        return false;
      }
    });
  </script>
<% } %>
```

**Key Points:**
- Wrap in `<% if (!targetItem) { %>`
- Use warning color for sensitive sections
- Client-side validation for better UX
- Also validate server-side (never trust client)

### 5. Form Actions

```html
<div class="card mb-4">
  <div class="card-body">
    <div class="d-flex justify-content-between">
      <a href="<%= targetItem ? '/[resource]/' + targetItem.id : '/[resource]' %>" 
         class="btn btn-secondary text-nowrap">
        <i class="bi bi-x-circle"></i> Cancel
      </a>
      <button type="submit" class="btn btn-primary text-nowrap">
        <i class="bi bi-check-circle"></i> 
        <%= targetItem ? 'Update' : 'Create' %> [Resource]
      </button>
    </div>
  </div>
</div>
```

**Key Points:**
- Cancel button returns to appropriate page
- Submit button text changes based on mode
- Use `text-nowrap` on both buttons
- Flex layout with space-between

### 6. Help Sidebar

```html
<div class="col-md-4">
  <!-- Requirements Card -->
  <div class="card mb-4">
    <div class="card-header bg-info text-white">
      <h5 class="mb-0"><i class="bi bi-info-circle"></i> Requirements</h5>
    </div>
    <div class="card-body">
      <h6>Name</h6>
      <ul class="small">
        <li>3-50 characters</li>
        <li>Letters, numbers, underscore, hyphen only</li>
        <li>Must be unique</li>
      </ul>

      <h6>Email</h6>
      <ul class="small">
        <li>Valid email format</li>
        <li>Must be unique</li>
      </ul>

      <% if (!targetItem) { %>
        <h6>Password</h6>
        <ul class="small">
          <li>Minimum 12 characters</li>
          <li>Must include uppercase letter</li>
          <li>Must include lowercase letter</li>
          <li>Must include number</li>
          <li>Must include special character</li>
        </ul>
      <% } %>
    </div>
  </div>

  <!-- Warnings Card (If Applicable) -->
  <% if (user.is_superuser) { %>
    <div class="card mb-4 border-warning">
      <div class="card-header bg-warning text-dark">
        <h5 class="mb-0"><i class="bi bi-exclamation-triangle"></i> Warning</h5>
      </div>
      <div class="card-body">
        <p class="small mb-0">
          Special status grants [elevated permissions]. Use with caution.
        </p>
      </div>
    </div>
  <% } %>
</div>
```

**Key Points:**
- Requirements card with info color
- List all validation rules
- Match help text to server-side validation
- Optional warning cards for sensitive features
- Conditional help based on mode (create vs edit)

### 7. Toast Notifications

```html
<!-- Toast Container -->
<div class="toast-container position-fixed bottom-0 start-0 p-3" style="z-index: 1050;">
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
  // Show toast on page load
  document.addEventListener('DOMContentLoaded', function() {
    const errorToast = document.getElementById('errorToast');
    
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
- Only error toasts on forms (success redirects to detail page)
- Position bottom-left
- Auto-dismiss after 5 seconds

## Server-Side Implementation

### GET Handler (Load Form)

```javascript
// Create form
fastify.get('/[resource]/new', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:write', done);
    }
  ]
}, async (request, reply) => {
  return reply.view('resource/form', {
    user: request.user,
    navigationMenu: getNavigationMenu(request.user),
    currentPath: '/[resource]',
    targetItem: null, // Indicates create mode
    error: request.query.error,
    config
  });
});

// Edit form
fastify.get('/[resource]/:id/edit', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:write', done);
    }
  ]
}, async (request, reply) => {
  const { id } = request.params;
  
  const item = await Model.getById(id);
  if (!item) {
    return reply.code(404).view('errors/404');
  }

  return reply.view('resource/form', {
    user: request.user,
    navigationMenu: getNavigationMenu(request.user),
    currentPath: '/[resource]',
    targetItem: item, // Indicates edit mode
    error: request.query.error,
    config
  });
});
```

### POST Handler (Submit Form)

```javascript
// Create
fastify.post('/[resource]/create', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:write', done);
    }
  ]
}, async (request, reply) => {
  const { name, email, is_active, is_special, password, confirmPassword } = request.body;

  try {
    // Validation
    if (password !== confirmPassword) {
      return reply.redirect('/[resource]/new?error=' + encodeURIComponent('Passwords do not match'));
    }

    // Check uniqueness
    const existing = await Model.getByField('name', name);
    if (existing) {
      return reply.redirect('/[resource]/new?error=' + encodeURIComponent('Name already exists'));
    }

    // Create
    const newItem = await Model.create({
      name,
      email,
      is_active: is_active === '1',
      is_special: user.is_superuser && is_special === '1', // Only superuser can set
      password // Will be hashed in model
    });

    // Audit log
    await auditLog.log({
      user_id: request.user.id,
      action: '[resource].create',
      resource_type: '[resource]',
      resource_id: newItem.id,
      details: { name, email }
    });

    return reply.redirect(`/[resource]/${newItem.id}?success=` + 
                         encodeURIComponent('[Resource] created successfully'));
  } catch (error) {
    return reply.redirect('/[resource]/new?error=' + encodeURIComponent(error.message));
  }
});

// Update
fastify.post('/[resource]/:id/update', {
  preHandler: [
    sessionAuthMiddleware,
    (request, reply, done) => {
      checkCapability(request, reply, '[resource]:write', done);
    }
  ]
}, async (request, reply) => {
  const { id } = request.params;
  const { name, email, is_active, is_special } = request.body;

  try {
    // Check exists
    const existing = await Model.getById(id);
    if (!existing) {
      return reply.code(404).view('errors/404');
    }

    // Check uniqueness (excluding current item)
    const duplicate = await Model.getByFieldExcluding('name', name, id);
    if (duplicate) {
      return reply.redirect(`/[resource]/${id}/edit?error=` + 
                           encodeURIComponent('Name already exists'));
    }

    // Update
    await Model.update(id, {
      name,
      email,
      is_active: is_active === '1',
      is_special: user.is_superuser ? (is_special === '1') : existing.is_special
    });

    // Audit log
    await auditLog.log({
      user_id: request.user.id,
      action: '[resource].update',
      resource_type: '[resource]',
      resource_id: id,
      details: { name, email }
    });

    return reply.redirect(`/[resource]/${id}?success=` + 
                         encodeURIComponent('[Resource] updated successfully'));
  } catch (error) {
    return reply.redirect(`/[resource]/${id}/edit?error=` + encodeURIComponent(error.message));
  }
});
```

**Key Points:**
- Use same template for create and edit
- `targetItem: null` for create mode
- Validate all input server-side
- Check uniqueness constraints
- Hash passwords before storage
- Protect sensitive fields (only superuser can set)
- Audit log all mutations
- Redirect with success to detail page
- Redirect with error back to form
- Use `encodeURIComponent()` for all messages

## Best Practices

1. **Single Template**: Use one template for both create and edit modes
2. **Pre-fill Values**: Always check `targetItem` exists before accessing fields
3. **Default Values**: Provide sensible defaults for new items (e.g., `is_active: true`)
4. **Client Validation**: Use HTML5 attributes and JavaScript for immediate feedback
5. **Server Validation**: Always validate server-side (never trust client)
6. **Text Nowrap**: Use on all buttons with icons
7. **Help Sidebar**: Document all validation rules and requirements
8. **Capability Gating**: Hide sensitive fields based on user permissions
9. **Error Handling**: Redirect back to form with error message
10. **Success Handling**: Redirect to detail page with success message
11. **Audit Logging**: Log all create/update operations
12. **Password Confirmation**: Always require confirmation for password fields

## Common Variations

### Select Dropdown

```html
<div class="mb-3">
  <label for="category" class="form-label">Category *</label>
  <select class="form-select" id="category" name="category" required>
    <option value="">Choose...</option>
    <option value="type1" <%= targetItem && targetItem.category === 'type1' ? 'selected' : '' %>>
      Type 1
    </option>
    <option value="type2" <%= targetItem && targetItem.category === 'type2' ? 'selected' : '' %>>
      Type 2
    </option>
  </select>
</div>
```

### Textarea

```html
<div class="mb-3">
  <label for="description" class="form-label">Description</label>
  <textarea class="form-control" 
            id="description" 
            name="description" 
            rows="3"
            maxlength="500"><%= targetItem ? targetItem.description : '' %></textarea>
  <div class="form-text">
    Maximum 500 characters. <%= (targetItem?.description?.length || 0) %> / 500
  </div>
</div>
```

### Number Input

```html
<div class="mb-3">
  <label for="count" class="form-label">Count *</label>
  <input type="number" 
         class="form-control" 
         id="count" 
         name="count" 
         value="<%= targetItem ? targetItem.count : 0 %>"
         min="0"
         max="1000"
         required>
</div>
```

### File Upload

```html
<div class="mb-3">
  <label for="file" class="form-label">File</label>
  <input class="form-control" type="file" id="file" name="file" accept=".pdf,.doc,.docx">
  <% if (targetItem && targetItem.file_path) { %>
    <div class="form-text">
      Current file: <a href="<%= targetItem.file_path %>"><%= targetItem.file_name %></a>
    </div>
  <% } %>
</div>
```

## Related Patterns

- [List Pages](ui-style-guide-list-pages.md)
- [Detail/View Pages](ui-style-guide-detail-pages.md)
- [UI Conventions](ui-style-guide-conventions.md)
