// VIMS — API Client Module
// Backend communication, rate limiting, error mapping

const API = {

  BASE_URL: 'http://localhost:8000',

  // Client-side rate limiter state
  _callLog: [],
  RATE_LIMIT: 10,       // max calls
  RATE_WINDOW: 60000,   // per 60 seconds

  /**
   * Check if we're within rate limit.
   * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
   */
  _checkRate() {
    const now = Date.now();
    this._callLog = this._callLog.filter(t => now - t < this.RATE_WINDOW);
    const remaining = this.RATE_LIMIT - this._callLog.length;
    if (remaining <= 0) {
      const oldest = this._callLog[0];
      const retryAfter = Math.ceil((this.RATE_WINDOW - (now - oldest)) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }
    return { allowed: true, remaining, retryAfter: 0 };
  },

  /**
   * Map error codes to operational messages.
   */
  ERROR_MAP: {
    'INVALID_PLATE':       'Invalid plate format. Verify and re-enter.',
    'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded. Retry after cooldown period.',
    'RTO_GATEWAY_TIMEOUT': 'National Registry unresponsive. Verify connectivity or use manual override.',
    'RTO_BLOCKED':         'VAHAN endpoint blocked request. Captcha or IP restriction active.',
    'SERVICE_UNAVAILABLE': 'Backend service unreachable. Verify server is running on port 8000.',
    'NETWORK_ERROR':       'Network connection failed. Check connectivity.',
    'UNKNOWN':             'Unexpected error occurred. Contact system administrator.',
  },

  /**
   * Perform a vehicle lookup against the backend.
   * @param {string} plate - Normalized plate string
   * @returns {Promise<{success: boolean, data: object|null, error: string|null, source: string|null}>}
   */
  async lookupVehicle(plate) {
    // Client-side rate check
    const rateCheck = this._checkRate();
    if (!rateCheck.allowed) {
      return {
        success: false,
        data: null,
        error: `RATE_LIMIT_EXCEEDED: Maximum ${this.RATE_LIMIT} lookups per minute. Retry after ${rateCheck.retryAfter}s.`,
        source: null
      };
    }

    // Validate plate client-side before sending
    const validation = SANITIZE.validatePlate(plate);
    if (!validation.valid) {
      return {
        success: false,
        data: null,
        error: `INVALID_PLATE: ${validation.error}`,
        source: null
      };
    }

    // Record the call
    this._callLog.push(Date.now());

    try {
      const response = await fetch(`${this.BASE_URL}/api/vehicle/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': AUTH.getSessionId() || 'anonymous',
        },
        body: JSON.stringify({ plate: validation.normalized }),
      });

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        return {
          success: false,
          data: null,
          error: `RATE_LIMIT_EXCEEDED: ${body.message || 'Too many requests.'}`,
          source: null
        };
      }

      if (response.status === 422) {
        const body = await response.json().catch(() => ({}));
        return {
          success: false,
          data: null,
          error: `INVALID_PLATE: ${body.detail || 'Validation failed.'}`,
          source: null
        };
      }

      if (!response.ok) {
        return {
          success: false,
          data: null,
          error: `SERVICE_UNAVAILABLE: HTTP ${response.status}`,
          source: null
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
        error: null,
        source: data.source || 'UNKNOWN'
      };

    } catch (err) {
      // Network error — backend probably not running
      // Fall back to client-side fallback
      console.warn('[VIMS API] Backend unreachable, using client fallback:', err.message);
      const fallbackData = this._clientFallback(validation.normalized);
      return {
        success: true,
        data: fallbackData,
        error: null,
        source: 'CLIENT_FALLBACK'
      };
    }
  },

  /**
   * Client-side offline fallback when the backend is unreachable.
   * Demo mode only: returns the same small set of clearly-fictional
   * sample plates as the backend's demo registry, or an honest
   * "not available offline" result. Never invents owner/vehicle data.
   */
  _clientFallback(plate) {
    const demoRegistry = {
      'MH12DM0001': {
        registration: {
          owner_name: 'Demo Owner One',
          rto: 'Demo RTO Office',
          state: 'Maharashtra',
          reg_date: '01-01-2022',
          vehicle_class: 'Motor Car (LMV)',
          rc_status: 'ACTIVE',
        },
        vehicle: {
          make: 'Demo Motors',
          model: 'Sample Hatchback',
          color: 'White',
          fuel_type: 'PETROL',
          body_type: 'Hatchback',
        },
        insurance: { company: 'Sample Insurance Co. (Demo)', status: 'ACTIVE', valid_until: '01-01-2027' },
        enforcement_status: { pending_challans: 1, notes: 'Sample data for UI demo only.' },
      },
      'DL04DM0002': {
        registration: {
          owner_name: 'Demo Owner Two',
          rto: 'Demo RTO Office',
          state: 'Delhi',
          reg_date: '15-06-2021',
          vehicle_class: 'Motor Car (LMV)',
          rc_status: 'ACTIVE',
        },
        vehicle: {
          make: 'Demo Motors',
          model: 'Sample SUV',
          color: 'Grey',
          fuel_type: 'DIESEL',
          body_type: 'SUV',
        },
        insurance: { company: 'Sample Insurance Co. (Demo)', status: 'EXPIRED', valid_until: '15-06-2025' },
        enforcement_status: { pending_challans: 0, notes: 'Sample data for UI demo only.' },
      },
    };

    if (demoRegistry[plate]) {
      const match = JSON.parse(JSON.stringify(demoRegistry[plate]));
      match.success = true;
      match.source = 'DEMO_DATA_OFFLINE';
      match.plate = plate;
      return match;
    }

    return {
      success: false,
      source: 'OFFLINE_NOT_AVAILABLE',
      plate: plate,
      error: 'Backend unreachable and this plate is not one of the offline demo samples.',
    };
  },

  /**
   * Get remaining rate limit quota.
   */
  getRateStatus() {
    const now = Date.now();
    this._callLog = this._callLog.filter(t => now - t < this.RATE_WINDOW);
    return {
      used: this._callLog.length,
      remaining: this.RATE_LIMIT - this._callLog.length,
      limit: this.RATE_LIMIT,
    };
  }
};
