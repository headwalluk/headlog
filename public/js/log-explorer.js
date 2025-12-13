/**
 * Log Explorer Page JavaScript
 * Handles filtering, modal interactions, and log detail rendering
 */

// Toggle custom date inputs based on date range selection
document.addEventListener('DOMContentLoaded', function() {
  const dateRangeSelect = document.getElementById('dateRange');
  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', function() {
      const customInputs = document.getElementById('customDateInputs');
      const customInputsTo = document.getElementById('customDateInputsTo');
      if (this.value === 'custom') {
        customInputs.style.display = 'block';
        customInputsTo.style.display = 'block';
      } else {
        customInputs.style.display = 'none';
        customInputsTo.style.display = 'none';
      }
    });
  }

  // Handle row clicks to show modal
  document.querySelectorAll('.log-row').forEach(row => {
    // Single click for better UX
    row.addEventListener('click', async function() {
      const logId = this.dataset.logId;
      const modal = new bootstrap.Modal(document.getElementById('logDetailModal'));
      const modalBody = document.getElementById('logDetailContent');
      const modalType = document.getElementById('modalLogType');
      
      // Show loading state
      modalBody.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      `;
      
      modal.show();
      
      // Fetch log details
      try {
        const response = await fetch(`/api/logs/${logId}`);
        if (!response.ok) throw new Error('Failed to load log details');
        
        const log = await response.json();
        
        // Update modal title
        modalType.innerHTML = log.log_type === 'access' 
          ? '<span class="badge bg-info">Access</span>' 
          : '<span class="badge bg-danger">Error</span>';
        
        // Render log details
        modalBody.innerHTML = renderLogDetails(log);
      } catch (error) {
        modalBody.innerHTML = `
          <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle"></i> Failed to load log details: ${error.message}
          </div>
        `;
      }
    });
  });
});

/**
 * Render log details in the modal
 * @param {Object} log - Log record with parsed_data
 * @returns {string} HTML string
 */
function renderLogDetails(log) {
  const timestamp = new Date(log.timestamp).toLocaleString();
  let html = `
    <div class="row mb-3">
      <div class="col-md-6">
        <strong>Timestamp:</strong><br>
        ${timestamp}
      </div>
      <div class="col-md-6">
        <strong>Log ID:</strong><br>
        #${log.id}
      </div>
    </div>
    <div class="row mb-3">
      <div class="col-md-6">
        <strong>Website:</strong><br>
        <span class="text-primary">${log.website_name}</span>
      </div>
      <div class="col-md-6">
        <strong>Host:</strong><br>
        <span class="text-muted">${log.hostname}</span>
      </div>
    </div>
    <div class="row mb-3">
      <div class="col-md-6">
        <strong>Remote IP:</strong><br>
        <code>${log.remote || '-'}</code>
      </div>
      <div class="col-md-6">
        <strong>HTTP Code:</strong><br>
        <span class="badge bg-secondary">${log.code}</span> ${log.code_description || ''}
      </div>
    </div>
  `;

  // Show key-value pairs from raw_data
  if (log.parsed_data) {
    html += `
      <hr>
      <h6 class="mb-3">Log Data</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <tbody>
    `;
    
    // Render all key-value pairs
    for (const [key, value] of Object.entries(log.parsed_data)) {
      // Skip empty or null values
      if (value === null || value === undefined || value === '' || value === '-') {
        continue;
      }
      
      // Format value based on type
      let displayValue;
      if (typeof value === 'object') {
        displayValue = `<pre class="mb-0"><code>${JSON.stringify(value, null, 2)}</code></pre>`;
      } else if (typeof value === 'boolean') {
        displayValue = value ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>';
      } else if (String(value).length > 100) {
        displayValue = `<small>${escapeHtml(String(value))}</small>`;
      } else {
        displayValue = escapeHtml(String(value));
      }
      
      html += `
        <tr>
          <td class="text-muted" style="width: 25%;"><strong>${escapeHtml(key)}</strong></td>
          <td>${displayValue}</td>
        </tr>
      `;
    }
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  // Raw JSON (collapsed)
  html += `
    <div class="mt-4">
      <p>
        <a class="btn btn-sm btn-outline-secondary" data-bs-toggle="collapse" href="#rawData" role="button">
          <i class="bi bi-code-square"></i> View Raw JSON
        </a>
      </p>
      <div class="collapse" id="rawData">
        <pre class="bg-light p-3 rounded" style="max-height: 300px; overflow-y: auto;"><code>${JSON.stringify(log.parsed_data, null, 2)}</code></pre>
      </div>
    </div>
  `;

  return html;
}

/**
 * Helper function to escape HTML and prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
