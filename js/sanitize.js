// VIMS — Input Sanitization, Validation & Safe DOM Module
// Universal Indian Vehicle Plate Parser & Maharashtra Police Validator

const SANITIZE = {

  // Universal Indian Vehicle Plate Regex Patterns
  PLATE_PATTERNS: {
    STANDARD_MODERN: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/,       // e.g. MH12AB1234, DL4CAF4432
    BHARAT_SERIES: /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/,                 // e.g. 22BH1234A, 22BH1234AB
    COMMERCIAL_TRANSPORT: /^[A-Z]{2}[0-9]{2}[A-Z]{1}[0-9]{4}$/,      // e.g. MH12Q1234
    LEGACY_VINTAGE: /^[A-Z]{2,3}[0-9]{1,4}$/,                         // e.g. MMU1234, BMU12, DDA1234
  },

  /**
   * Validate and normalize an Indian vehicle registration plate.
   * Strips all spaces, hyphens, and dots.
   * @param {string} raw - Raw input string
   * @returns {{ valid: boolean, normalized: string, formatType: string|null, error: string|null }}
   */
  validatePlate(raw) {
    if (!raw || typeof raw !== 'string') {
      return { valid: false, normalized: '', formatType: null, error: 'Plate number is required.' };
    }

    const normalized = raw.replace(/[\s\-\.]/g, '').toUpperCase();

    if (normalized.length < 3 || normalized.length > 12) {
      return { valid: false, normalized, formatType: null, error: 'Plate must be between 3 and 12 characters.' };
    }

    if (this.PLATE_PATTERNS.STANDARD_MODERN.test(normalized)) {
      return { valid: true, normalized, formatType: 'STANDARD_MODERN', error: null };
    }

    if (this.PLATE_PATTERNS.BHARAT_SERIES.test(normalized)) {
      return { valid: true, normalized, formatType: 'BHARAT_SERIES', error: null };
    }

    if (this.PLATE_PATTERNS.COMMERCIAL_TRANSPORT.test(normalized)) {
      return { valid: true, normalized, formatType: 'COMMERCIAL_TRANSPORT', error: null };
    }

    if (this.PLATE_PATTERNS.LEGACY_VINTAGE.test(normalized)) {
      return { valid: true, normalized, formatType: 'LEGACY_VINTAGE', error: null };
    }

    return {
      valid: false,
      normalized,
      formatType: null,
      error: 'Invalid format. Expected Standard Modern (MH12DE1433), BH Series (22BH1234A), Commercial (MH12Q1234), or Legacy format.'
    };
  },

  /**
   * Strip HTML tags and encode dangerous characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  },

  /**
   * Sanitize free-text input: trim, remove control chars.
   * @param {string} str
   * @returns {string}
   */
  sanitizeText(str) {
    if (!str) return '';
    return str.replace(/[^\x20-\x7E\xA0-\xFF\n\t\u0900-\u097F]/g, '').trim();
  },

  /**
   * Sanitize and uppercase a plate input, stripping whitespace and hyphens.
   * @param {string} str
   * @returns {string}
   */
  sanitizePlate(str) {
    if (!str) return '';
    return str.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  },

  /**
   * Validate government/police email format.
   * @param {string} email
   * @returns {boolean}
   */
  isGovEmail(email) {
    if (!email) return false;
    const lower = email.toLowerCase().trim();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]*gov\.in$/i.test(lower) ||
           /^[a-z0-9._%+-]+@[a-z0-9.-]*mahapolice\.gov\.in$/i.test(lower) ||
           /^[a-z0-9._%+-]+@[a-z0-9.-]*police\.gov\.in$/i.test(lower) ||
           /^[a-z0-9._%+-]+@[a-z0-9.-]*nic\.in$/i.test(lower);
  },

  /**
   * Validate Maharashtra Police Badge / Service ID format.
   * e.g. MH-PI-4501, MH-PSI-2104, MH-HC-8812, PUNE-4501
   * @param {string} badge
   * @returns {boolean}
   */
  isValidBadgeId(badge) {
    if (!badge) return false;
    const clean = badge.trim().toUpperCase();
    return /^MH-[A-Z]{2,4}-[0-9]{3,5}$/.test(clean) || /^[A-Z]{2,6}-[0-9]{3,5}$/.test(clean);
  },

  /**
   * Validate 10-digit Indian mobile number.
   * @param {string} num
   * @returns {boolean}
   */
  isValidMobile(num) {
    if (!num) return false;
    const cleaned = num.replace(/[\s\-]/g, '');
    return /^[6-9][0-9]{9}$/.test(cleaned);
  },

  /**
   * Validate 6-digit OTP.
   * @param {string} otp
   * @returns {boolean}
   */
  isValidOTP(otp) {
    if (!otp) return false;
    return /^[0-9]{6}$/.test(otp.trim());
  },

  /**
   * Safe DOM Element Builder: avoids innerHTML string concatenation vulnerabilities.
   * @param {string} tag
   * @param {Object} [attributes]
   * @param {Array|string|Node} [children]
   * @returns {HTMLElement}
   */
  buildElement(tag, attributes = {}, children = null) {
    const el = document.createElement(tag);
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'class') {
          el.className = value;
        } else if (key === 'text') {
          el.textContent = value;
        } else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'id' || key === 'type' || key === 'pattern') {
          el.setAttribute(key, value);
        } else {
          el[key] = value;
        }
      }
    }

    if (children) {
      if (Array.isArray(children)) {
        children.forEach(child => {
          if (!child) return;
          if (typeof child === 'string' || typeof child === 'number') {
            el.appendChild(document.createTextNode(String(child)));
          } else if (child instanceof Node) {
            el.appendChild(child);
          }
        });
      } else if (typeof children === 'string' || typeof children === 'number') {
        el.appendChild(document.createTextNode(String(children)));
      } else if (children instanceof Node) {
        el.appendChild(children);
      }
    }

    return el;
  },

  debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }
};
