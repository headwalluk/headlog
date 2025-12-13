/**
 * Common JavaScript for Headlog UI
 */

// Initialize Bootstrap tooltips
document.addEventListener('DOMContentLoaded', function () {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
});

// Auto-dismiss alerts after 5 seconds
document.addEventListener('DOMContentLoaded', function () {
  const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
  alerts.forEach(alert => {
    if (!alert.classList.contains('alert-permanent')) {
      setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
      }, 5000);
    }
  });
});

// Confirm dangerous actions
document.addEventListener('DOMContentLoaded', function () {
  const dangerousForms = document.querySelectorAll('form[data-confirm]');
  dangerousForms.forEach(form => {
    form.addEventListener('submit', function (e) {
      const message = form.dataset.confirm || 'Are you sure?';
      if (!confirm(message)) {
        e.preventDefault();
        return false;
      }
    });
  });

  const dangerousButtons = document.querySelectorAll('button[data-confirm], a[data-confirm]');
  dangerousButtons.forEach(btn => {
    btn.addEventListener('click', function (e) {
      const message = btn.dataset.confirm || 'Are you sure?';
      if (!confirm(message)) {
        e.preventDefault();
        return false;
      }
    });
  });
});
