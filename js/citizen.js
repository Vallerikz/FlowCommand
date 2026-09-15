// VIMS — Citizen Portal Controller
// Manages public vehicle status checks, incident grievance reporting

const CITIZEN = {
  user: null,
  currentView: 'citizen-home',

  // Dynamic grievance list — zero dummy arrays
  grievanceData: [],

  init() {
    this.user = AUTH.requireCitizen();
    if (!this.user) return;

    I18N.init();
    this.startISTClock();
    this.renderUserProfile();
    this.attachEventListeners();
    this.renderGrievances();
  },

  startISTClock() {
    const clockEl = document.getElementById('istClock');
    const update = () => {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      };
      const formatted = new Intl.DateTimeFormat('en-GB', options).format(now).replace(',', '');
      if (clockEl) clockEl.textContent = `${formatted} IST`;
    };
    update();
    setInterval(update, 1000);
  },

  renderUserProfile() {
    const nameEl = document.getElementById('headerUserName');
    if (nameEl) nameEl.textContent = this.user.name || 'Citizen User';
  },

  attachEventListeners() {
    // Navigation Links
    document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
      link.addEventListener('click', () => {
        const viewId = link.getAttribute('data-view');
        if (viewId) this.showView(viewId);
      });
    });

    // Language Toggle
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => I18N.toggleLanguage());
    }

    // Sign Out
    const signoutBtn = document.getElementById('btnSignOut');
    if (signoutBtn) signoutBtn.addEventListener('click', () => AUTH.logout());
    const sideSignout = document.getElementById('sidebarSignOut');
    if (sideSignout) sideSignout.addEventListener('click', () => AUTH.logout());

    // Action Quick Buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'goto-cit-lookup') this.showView('citizen-lookup');
        if (action === 'goto-cit-report') this.showView('citizen-report');
        if (action === 'goto-cit-grievance') this.showView('citizen-grievance');
      });
    });

    // Citizen Lookup Form
    const citForm = document.getElementById('citLookupForm');
    if (citForm) {
      citForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCitizenLookup();
      });
    }

    // Citizen Report Form
    const repForm = document.getElementById('citReportForm');
    if (repForm) {
      repForm.addEventListener('submit', (e) => this.handleReportSubmit(e));
    }

    // Grievance Search Form
    const grvForm = document.getElementById('grievanceQueryForm');
    if (grvForm) {
      grvForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.searchGrievance();
      });
    }
  },

  showView(viewId) {
    this.currentView = viewId;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.sidebar-link').forEach(link => {
      const match = link.getAttribute('data-view') === viewId;
      link.classList.toggle('active', match);
    });
  },

  async handleCitizenLookup() {
    const input = document.getElementById('citizenPlateQuery');
    const errEl = document.getElementById('citLookupError');
    const resultEl = document.getElementById('citLookupResult');
    const plate = input ? input.value.trim() : '';

    if (errEl) errEl.classList.add('hidden');
    resultEl.innerHTML = '';

    const validation = SANITIZE.validatePlate(plate);
    if (!validation.valid) {
      if (errEl) {
        errEl.textContent = validation.error;
        errEl.classList.remove('hidden');
      }
      return;
    }

    try {
      const response = await API.lookupVehicle(validation.normalized);
      if (!response.success) {
        if (errEl) {
          errEl.textContent = response.error;
          errEl.classList.remove('hidden');
        }
        return;
      }

      const d = response.data || {};
      const reg = d.registration || {};
      const veh = d.vehicle || {};
      const ins = d.insurance || {};
      const stat = d.status || {};

      const card = SANITIZE.buildElement('div', { className: 'card mt-12' }, [
        SANITIZE.buildElement('div', { className: 'card-hdr' }, [
          SANITIZE.buildElement('span', { text: `Vehicle Status for ${d.plate}` }),
          SANITIZE.buildElement('span', { className: `badge ${ins.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}`, text: `Insurance: ${ins.status}` })
        ]),
        SANITIZE.buildElement('div', { className: 'card-body' }, [
          SANITIZE.buildElement('div', { className: 'detail-grid mb-12' }, [
            SANITIZE.buildElement('div', { className: 'detail-item' }, [
              SANITIZE.buildElement('div', { className: 'detail-lbl', text: 'Vehicle Model' }),
              SANITIZE.buildElement('div', { className: 'detail-val', text: `${veh.make} ${veh.model}` })
            ]),
            SANITIZE.buildElement('div', { className: 'detail-item' }, [
              SANITIZE.buildElement('div', { className: 'detail-lbl', text: 'Registration Authority' }),
              SANITIZE.buildElement('div', { className: 'detail-val', text: `${reg.rto}, ${reg.state}` })
            ]),
            SANITIZE.buildElement('div', { className: 'detail-item' }, [
              SANITIZE.buildElement('div', { className: 'detail-lbl', text: 'Registration Date' }),
              SANITIZE.buildElement('div', { className: 'detail-val mono', text: reg.reg_date })
            ]),
            SANITIZE.buildElement('div', { className: 'detail-item' }, [
              SANITIZE.buildElement('div', { className: 'detail-lbl', text: 'Active Challans' }),
              SANITIZE.buildElement('div', { className: 'detail-val', text: `${stat.challan_pending || 0} Pending` })
            ])
          ]),
          SANITIZE.buildElement('div', { className: `alert-bar ${stat.blacklisted ? 'alert-red' : 'alert-green'}` }, [
            SANITIZE.buildElement('div', {}, [
              SANITIZE.buildElement('div', { className: 'alert-title', text: stat.blacklisted ? 'ATTENTION: VEHICLE HAS ACTIVE POLICE NOTICE' : 'POLICE RECORD STATUS: CLEAR' }),
              SANITIZE.buildElement('div', { className: 'alert-detail', text: stat.blacklisted ? 'This vehicle registration is currently flagged under active police verification.' : 'No stolen or cloned plate bulletins are registered against this vehicle number.' })
            ])
          ])
        ])
      ]);

      resultEl.appendChild(card);
      resultEl.classList.remove('hidden');

    } catch (err) {
      this.showToast('Query error: ' + err.message, 'error');
    }
  },

  handleReportSubmit(e) {
    e.preventDefault();
    const plate = SANITIZE.sanitizePlate(document.getElementById('repPlate').value);
    const type = document.getElementById('repType').value;
    const loc = SANITIZE.sanitizeText(document.getElementById('repLocation').value);
    const desc = SANITIZE.sanitizeText(document.getElementById('repDesc').value);
    const contact = document.getElementById('repContact').value.trim();

    if (!plate || !type || !loc) {
      this.showToast('Please complete all mandatory report fields.', 'error');
      return;
    }

    const refNum = `GRV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Intl.DateTimeFormat('en-GB').format(new Date()).replace(/\//g, '-');

    const categoryNames = {
      'THEFT': 'Vehicle Theft / Stolen Vehicle',
      'CLONED_PLATE': 'Suspected Duplicate / Cloned Plate',
      'WRONG_CHALLAN': 'Incorrect E-Challan Discrepancy',
      'HIT_AND_RUN': 'Hit & Run Witness Report',
      'ABANDONED': 'Suspicious / Abandoned Vehicle'
    };

    const newGrievance = {
      ref: refNum,
      date: today,
      plate: plate,
      category: categoryNames[type] || type,
      station: 'Central Command Dispatch',
      status: 'SUBMITTED',
      badgeClass: 'badge-blue'
    };

    this.grievanceData.unshift(newGrievance);
    this.renderGrievances();

    this.showToast(`Grievance filed successfully. Case Reference: ${refNum}`, 'success');
    e.target.reset();

    setTimeout(() => this.showView('citizen-grievance'), 1200);
  },

  renderGrievances() {
    const tbody = document.getElementById('grievanceTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (this.grievanceData.length === 0) {
      tbody.appendChild(
        SANITIZE.buildElement('tr', {}, [
          SANITIZE.buildElement('td', { colSpan: 6, className: 'text-center text-muted font-mono', style: 'padding:24px;', text: '[NO RECORD FOUND]' })
        ])
      );
      return;
    }

    this.grievanceData.forEach(g => {
      tbody.appendChild(
        SANITIZE.buildElement('tr', {}, [
          SANITIZE.buildElement('td', { className: 'cell-mono font-bold', text: g.ref }),
          SANITIZE.buildElement('td', { text: g.date }),
          SANITIZE.buildElement('td', {}, [SANITIZE.buildElement('span', { className: 'cell-mono', text: g.plate })]),
          SANITIZE.buildElement('td', { text: g.category }),
          SANITIZE.buildElement('td', { text: g.station }),
          SANITIZE.buildElement('td', {}, [SANITIZE.buildElement('span', { className: `badge ${g.badgeClass}`, text: g.status })])
        ])
      );
    });
  },

  searchGrievance() {
    const query = (document.getElementById('grievanceQueryInput').value || '').trim().toUpperCase();
    if (!query) {
      this.showToast('Enter a grievance reference number to search.', 'warn');
      return;
    }

    const match = this.grievanceData.find(g => g.ref.toUpperCase().includes(query) || g.plate.includes(query));
    if (match) {
      this.showToast(`Record located: ${match.ref} — Current Status: ${match.status}`, 'success');
    } else {
      this.showToast(`No record matching reference ${query} found.`, 'error');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = SANITIZE.buildElement('div', { className: `toast-msg t-${type}`, text: message });
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('exit');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 3500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  CITIZEN.init();
});
