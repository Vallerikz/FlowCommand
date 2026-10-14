// VIMS — API Client Module
// Backend communication, rate limiting, error mapping

const API = {

  BASE_URL: (() => {
    const host = window.location.hostname || 'localhost';
    const port = window.location.port === '3000' ? '8000' : (window.location.port || '8000');
    return window.location.protocol + '//' + host + ':' + port;
  })(),

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
          'Authorization': 'Bearer ' + ((AUTH.getSession() || {}).token || '')
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
        registration: { owner_name: 'Demo Owner One', rto: 'Demo RTO Office', state: 'Maharashtra', reg_date: '01-01-2022', vehicle_class: 'Motor Car (LMV)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Demo Motors', model: 'Sample Hatchback', color: 'White', fuel_type: 'PETROL', body_type: 'Hatchback' },
        insurance: { company: 'Sample Insurance Co. (Demo)', status: 'ACTIVE', valid_until: '01-01-2027' },
        enforcement_status: { pending_challans: 1, notes: 'Sample data for UI demo only.' },
      },
      'DL04DM0002': {
        registration: { owner_name: 'Demo Owner Two', rto: 'Demo RTO Office', state: 'Delhi', reg_date: '15-06-2021', vehicle_class: 'Motor Car (LMV)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Demo Motors', model: 'Sample SUV', color: 'Grey', fuel_type: 'DIESEL', body_type: 'SUV' },
        insurance: { company: 'Sample Insurance Co. (Demo)', status: 'EXPIRED', valid_until: '15-06-2025' },
        enforcement_status: { pending_challans: 0, notes: 'Sample data for UI demo only.' },
      },
      'MH12DE1433': {
        registration: { owner_name: 'Kavita Suresh Patil', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '12-03-2020', vehicle_class: 'Motor Car (LMV)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Maruti Suzuki', model: 'Swift VXi', color: 'White', fuel_type: 'PETROL', body_type: 'Hatchback' },
        insurance: { company: 'New India Assurance', status: 'ACTIVE', valid_until: '10-03-2027' },
        pucc: { status: 'ACTIVE', valid_until: '05-09-2027' },
        enforcement_status: { pending_challans: 3, notes: 'Speed violation & signal jump challans pending.' },
      },
      'DL04CAF5571': {
        registration: { owner_name: 'Rajesh Kumar Sharma', rto: 'Delhi West (DL-04)', state: 'Delhi', reg_date: '18-08-2019', vehicle_class: 'Motor Car (LMV)', rc_status: 'FLAGGED' },
        vehicle: { make: 'Mahindra', model: 'Scorpio S11', color: 'Silver', fuel_type: 'DIESEL', body_type: 'SUV' },
        insurance: { company: 'National Insurance', status: 'EXPIRED', valid_until: '12-08-2024' },
        pucc: { status: 'EXPIRED', valid_until: '10-08-2024' },
        enforcement_status: { pending_challans: 0, notes: 'Active FIR-2026/8812 (Theft Bulletin — Intercept on Sight).' },
      },
      'MH12AB1001': {
        registration: { owner_name: 'Rohan Amit Shinde', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '10-04-2021', vehicle_class: 'Motor Cycle / Scooter (2W)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Bajaj Auto', model: 'Pulsar 150 Twin Disc', color: 'Laser Black / Blue', fuel_type: 'PETROL', body_type: 'Two-Wheeler' },
        insurance: { company: 'Bajaj Allianz General Insurance', status: 'ACTIVE', valid_until: '08-04-2027' },
        pucc: { status: 'ACTIVE', valid_until: '14-10-2026' },
        enforcement_status: { pending_challans: 0, notes: 'Clean record. Valid helmet compliance.' },
      },
      'MH14CD2002': {
        registration: { owner_name: 'Vikram Jadhav', rto: 'Pimpri-Chinchwad (MH-14)', state: 'Maharashtra', reg_date: '22-09-2022', vehicle_class: 'Motor Cycle / Scooter (2W)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Royal Enfield', model: 'Classic 350 Dark', color: 'Stealth Black', fuel_type: 'PETROL', body_type: 'Two-Wheeler' },
        insurance: { company: 'ICICI Lombard', status: 'ACTIVE', valid_until: '18-09-2027' },
        pucc: { status: 'ACTIVE', valid_until: '20-03-2027' },
        enforcement_status: { pending_challans: 1, notes: 'Over-speeding fine on Old Mumbai-Pune Highway.' },
      },
      'MH12T5005': {
        registration: { owner_name: 'Ganesh Tukaram Shinde', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '05-02-2020', vehicle_class: 'Three Wheeler (Passenger Auto)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Bajaj Auto', model: 'RE Compact Auto CNG', color: 'Yellow & Green', fuel_type: 'CNG', body_type: 'Auto-Rickshaw' },
        insurance: { company: 'United India Insurance', status: 'ACTIVE', valid_until: '01-02-2027' },
        pucc: { status: 'ACTIVE', valid_until: '15-08-2026' },
        enforcement_status: { pending_challans: 0, notes: 'Commercial passenger permit valid.' },
      },
      'MH12T9009': {
        registration: { owner_name: 'Raju Transport Logistics', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '14-11-2019', vehicle_class: 'Light Goods Vehicle (LGV / Tempo)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Tata Motors', model: 'Tata Ace Gold (Chota Hathi)', color: 'Arctic White', fuel_type: 'DIESEL', body_type: 'Mini Truck' },
        insurance: { company: 'The Oriental Insurance Co.', status: 'ACTIVE', valid_until: '10-11-2026' },
        pucc: { status: 'ACTIVE', valid_until: '05-05-2027' },
        enforcement_status: { pending_challans: 1, notes: 'Lane obstruction penalty recorded.' },
      },
      'MH12T1111': {
        registration: { owner_name: 'Bharat Multi-Axle Logistics Corp', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '08-08-2018', vehicle_class: 'Heavy Commercial Vehicle (HCV / Truck)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Ashok Leyland', model: '1618 Cargo Hauler', color: 'Highway Brown / Orange', fuel_type: 'DIESEL', body_type: 'Heavy Multi-Axle Truck' },
        insurance: { company: 'National Insurance Company', status: 'ACTIVE', valid_until: '01-08-2027' },
        pucc: { status: 'EXPIRED', valid_until: '01-01-2025' },
        enforcement_status: { pending_challans: 4, notes: 'PUCC expired & overloaded cargo permit inspection pending.' },
      },
      'MH14EU4092': {
        registration: { owner_name: 'Sneha Pramod Kulkarni', rto: 'Pimpri-Chinchwad (MH-14)', state: 'Maharashtra', reg_date: '27-01-2023', vehicle_class: 'Motor Car (LMV)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Hyundai', model: 'Creta SX (O) 1.5 Turbo', color: 'Phantom Black', fuel_type: 'PETROL', body_type: 'SUV' },
        insurance: { company: 'HDFC ERGO General Insurance', status: 'ACTIVE', valid_until: '22-01-2028' },
        pucc: { status: 'EXPIRED', valid_until: '15-07-2025' },
        enforcement_status: { pending_challans: 2, notes: 'PUC expired & wrong-way driving challan.' },
      },
      '22BH1234A': {
        registration: { owner_name: 'Amitesh Ranjan', rto: 'Bharat Series (BH — Transferable)', state: 'Maharashtra', reg_date: '03-06-2022', vehicle_class: 'Motor Cycle / Scooter (2W)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Honda', model: 'Activa 6G DLX', color: 'Pearl Precious White', fuel_type: 'PETROL', body_type: 'Two-Wheeler' },
        insurance: { company: 'SBI General Insurance', status: 'ACTIVE', valid_until: '01-06-2027' },
        pucc: { status: 'ACTIVE', valid_until: '28-12-2026' },
        enforcement_status: { pending_challans: 0, notes: 'Clean record. BH-series transferable registration.' },
      },
      'MH12EF3003': {
        registration: { owner_name: 'Priya Arun Deshpande', rto: 'Pune Central (MH-12)', state: 'Maharashtra', reg_date: '15-11-2021', vehicle_class: 'Motor Car (LMV)', rc_status: 'ACTIVE' },
        vehicle: { make: 'Honda', model: 'City ZX CVT', color: 'Radiant Red Metallic', fuel_type: 'PETROL', body_type: 'Sedan' },
        insurance: { company: 'Tata AIG General Insurance', status: 'ACTIVE', valid_until: '12-11-2027' },
        pucc: { status: 'ACTIVE', valid_until: '20-05-2027' },
        enforcement_status: { pending_challans: 1, notes: 'Parking violation near FC Road.' },
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
