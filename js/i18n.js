// VIMS — Comprehensive Internationalization (i18n) Module
// Full-text translation: Every visible text element, not just headlines
// GIGW 3.0 Mandatory Bilingual Support: English & Hindi (हिन्दी)

const I18N = {
  CURRENT_LANG: 'en',
  STORAGE_KEY: 'vims_portal_lang',

  DICTIONARY: {
    en: {
      // ─── System Header ───
      'sys_tagline': 'Vehicle Intelligence & Movement Tracking System',
      'sys_title': 'VIMS ICCC',
      'sys_subtitle': 'INTEGRATED COMMAND & CONTROL CENTER',
      'sys_status_secure': 'Secure',
      'sys_status_active': 'ICCC PUNE NODE: ACTIVE',
      'sys_status_cit': 'CITIZEN PORTAL: ACTIVE',
      'lang_toggle': 'EN | हि',

      // ─── Top Navigation ───
      'topnav_dashboard': 'DASHBOARD',
      'topnav_fleet_map': 'FLEET MAP',
      'topnav_vehicles': 'VEHICLES',
      'topnav_alerts': 'ALERTS',
      'topnav_reports': 'REPORTS',
      'topnav_analytics': 'ANALYTICS',
      'topnav_security': 'SECURITY',
      'topnav_help': 'HELP',

      // ─── Sidebar Navigation ───
      'nav_live_tracking': 'Live Tracking',
      'nav_fleet_overview': 'Fleet Overview',
      'nav_incident_logs': 'Incident Logs',
      'nav_route_mgmt': 'Route Mgmt',
      'nav_asset_database': 'Asset Database',
      'nav_staff': 'Staff',
      'nav_system_logs': 'System Logs',
      'nav_command_centre': 'Command Centre',
      'nav_vehicle_lookup': 'Vehicle Registry Query',
      'nav_video_ingest': 'Video Ingest & CCTV Stream',
      'nav_detection_log': 'Detection Trail (Audit Log)',
      'nav_camera_network': 'Junction Cameras (Pune City CCTV Grid)',
      'nav_watchlist': 'Active Watchlist & Stolen Alerts',
      'nav_citizen_home': 'Portal Home',
      'nav_citizen_lookup': 'Check Vehicle Status',
      'nav_citizen_report': 'Report Incident',
      'nav_citizen_grievance': 'Track Grievance',

      // ─── New Relatable Tab Titles & Labels (en) ───
      'fleet_overview_title': 'Active Fleet Inventory & Deployment',
      'fleet_overview_sub': 'Real-time telemetry, patrol sectors, and readiness status across Pune Metropolitan Region',
      'th_unit_id': 'Unit ID',
      'th_class_model': 'Class / Model',
      'th_sector_zone': 'Assigned Sector',
      'th_commander': 'Officer in Command',
      'th_telemetry': 'Speed / Fuel',
      'btn_export_fleet': 'Export Fleet CSV',
      'btn_track_live': 'Track Live',

      'incident_logs_title': 'Traffic & Security Incident Ledger',
      'incident_logs_sub': 'Live dispatch logs, ANPR discrepancy alerts, and enforcement actions',
      'th_incident_id': 'Incident ID',
      'th_violation': 'Violation / Anomaly',
      'th_unit_dispatched': 'Unit Dispatched',
      'btn_issue_challan': 'Issue E-Challan',
      'btn_dispatch_unit': 'Dispatch Patrol',

      'route_mgmt_title': 'Corridor Flow & Autonomous Green Corridors',
      'route_mgmt_sub': 'Emergency preemption, transit progression, and congestion management',
      'btn_trigger_green_wave': 'Trigger Autonomous Green Corridor',
      'card_green_wave': 'Emergency Preemption Dispatcher',
      'card_arterial_status': 'Pune Metro Arterial Corridors',

      'asset_database_title': 'ICCC Smart Infrastructure & Asset Ledger',
      'asset_database_sub': 'Lifecycle, telemetry health, and diagnostics of IoT sensors, CCTV nodes, and ATSC controllers',
      'th_asset_tag': 'Asset Tag',
      'th_equipment': 'Equipment Specification',
      'th_ip_mac': 'IP / MAC Address',
      'th_firmware': 'Firmware',
      'th_uptime': 'Uptime Health',

      'staff_title': 'Command Personnel & Field Traffic Roster',
      'staff_sub': 'Officer duty status, tactical radio channels, patrol sectors, and shift assignments',
      'th_badge': 'Badge No.',
      'th_officer': 'Officer Name & Rank',
      'th_assignment': 'Assignment Duty',
      'th_radio_ch': 'Radio Channel',
      'btn_radio_call': 'Radio Connect',

      'system_logs_title': 'System Telemetry & Security Audit Ledger',
      'system_logs_sub': 'Immutable operational audit trail, kernel events, ATSC cycle telemetry, and SMS OTP gateway logs',
      'btn_pause_feed': 'Pause Feed',
      'btn_resume_feed': 'Resume Feed',
      'btn_export_audit': 'Export Audit Trail',

      // ─── Legend ───
      'legend_active': 'Active',
      'legend_alert': 'Alert',
      'legend_warning': 'Warning',

      // ─── Sign Out ───
      'sign_out': 'Sign Out',
      'sign_in': 'Sign In',
      'create_account': 'Create Account',
      'register_node': 'Register Officer',

      // ─── Map Section ───
      'map_title': 'SINGLE JUNCTION MINIMAP (2 PERPENDICULAR LANES)',
      'junction_node': 'JUNC-01 CENTRAL',
      'lane_1_label': 'LANE 1: NORTH-SOUTH',
      'lane_2_label': 'LANE 2: EAST-WEST',
      'btn_auto': 'AUTO ATSC',
      'btn_force_lane_1': 'FORCE LANE 1 (NS)',
      'btn_force_lane_2': 'FORCE LANE 2 (EW)',
      'btn_all_red': 'ALL RED',
      'pcu_load': 'PCU Load',
      'queue_len': 'Queue',

      // ─── Filters ───
      'filter_search_vehicle': 'Search Vehicle ID',
      'filter_vehicle_type': 'Vehicle Type',
      'filter_heavy': 'Heavy',
      'filter_commercial': 'Commercial',
      'filter_private': 'Private',
      'filter_status': 'Status',
      'filter_active': 'Active',
      'filter_alert': 'Alert',
      'filter_warning_opt': 'Warning',
      'filter_region': 'Region',
      'filter_pune': 'Pune City',
      'filter_nh': 'National Highway',
      'filter_suburban': 'Suburban',
      'filter_time_range': 'Time Range',
      'filter_1h': 'Last 1 Hour',
      'filter_6h': 'Last 6 Hours',
      'filter_24h': 'Last 24 Hours',
      'filter_all_junctions': 'All Junction Nodes',
      'filter_all_statuses': 'All Statuses',
      'filter_verified': 'Registry Verified',
      'filter_mismatch': 'Registry Mismatch',
      'filter_stolen': 'Stolen Vehicle Alert',
      'filter_challan': 'Pending Challan',

      // ─── Stats Cards ───
      'stat_active_fleet': 'ACTIVE FLEET',
      'stat_vehicles_on_road': 'Vehicles On Road',
      'stat_operational': 'Operational',
      'stat_total_alerts': 'TOTAL ALERTS',
      'stat_critical': 'Critical',
      'stat_warnings': 'Warnings',
      'stat_vehicle_utilization': 'VEHICLE UTILIZATION',

      // ─── Utilization Legend ───
      'util_heavy': 'Heavy',
      'util_commercial': 'Commercial',
      'util_private': 'Private',

      // ─── Table Headers ───
      'th_time': 'Time',
      'th_time_ist': 'Time (IST)',
      'th_alert_level': 'Alert Level',
      'th_vehicle_id': 'Vehicle ID',
      'th_location': 'Location',
      'th_type': 'Type',
      'th_id': 'ID',
      'th_vehicle': 'Vehicle',
      'th_status': 'Status',
      'th_junction_node': 'Junction Node',
      'th_plate_number': 'Plate Number',
      'th_vehicle_type': 'Vehicle Silhouette',
      'th_color': 'Observed Color',
      'th_registry': 'Registry Record',
      'th_node_id': 'Node ID',
      'th_junction': 'Junction / Corridor',
      'th_zone': 'Zone',
      'th_resolution': 'Resolution & FPS',
      'th_hardware': 'Edge Hardware',
      'th_bulletin_id': 'Bulletin ID',
      'th_vehicle_plate': 'Vehicle Plate',
      'th_model': 'Registered Model',
      'th_station': 'Police Station',
      'th_fir': 'FIR / Reference',
      'th_number_plate': 'Number Plate',
      'th_observed_vehicle': 'Observed Vehicle',
      'th_vahan_record': 'VAHAN Record',
      'th_operational_status': 'Operational Status',
      'th_action': 'Action',

      // ─── Alert Types ───
      'alert_critical': 'CRITICAL',
      'alert_warning': 'WARNING',
      'type_speeding': 'Speeding',
      'type_route_deviation': 'Route Deviation',
      'type_unauthorized_stop': 'Unauthorized Stop',
      'type_geofence_breach': 'Geofence Breach',

      // ─── Locations ───
      'loc_ring_road': 'Ring Road',
      'loc_nh8': 'NH8',
      'loc_swargate': 'Swargate Junction',
      'loc_hinjewadi': 'Hinjewadi Phase-1',
      'loc_noida_sec18': 'Noida Sec 18',
      'loc_wakad': 'Wakad Bridge',
      'loc_airport_rd': 'Airport Road',

      // ─── Status Badges ───
      'status_dispatched': 'Dispatched',
      'status_resolved': 'Resolved',
      'status_investigating': 'Investigating',

      // ─── Card Titles ───
      'card_active_alerts_feed': 'ACTIVE ALERTS FEED',
      'card_recent_incidents': 'RECENT INCIDENTS',
      'card_registry_search': 'National Transport Registry Search',
      'card_rtsp_binding': 'Pune Traffic CCTV Stream Binding (NVDEC Hardware Decode)',
      'card_footage_dissection': 'Recorded CCTV Incident Footage Dissection (.mp4)',
      'card_detection_lifecycle': 'Detection Lifecycle',
      'card_junction_filter': 'Junction Filter',
      'card_camera_telemetry': 'Camera Nodes Telemetry',
      'card_hotlist': 'Police Hotlist Bulletins (Pune Police Commissionerate)',

      // ─── Buttons ───
      'btn_view_details': 'View Details',
      'btn_query_registry': 'Query VAHAN Registry',
      'btn_execute_pipeline': 'Execute 5-Stage Detection Pipeline',
      'btn_submit_report': 'Submit Formal Grievance to Police Command',
      'btn_search_record': 'Search Record',
      'btn_authenticate': 'Authenticate & Access Command Node',
      'btn_get_otp': 'Get OTP',
      'btn_send_sms_otp': 'Send SMS OTP',
      'btn_bind_stream': 'Bind Camera Stream to Edge Daemon',

      // ─── Badges ───
      'badge_rtsp': 'RTSP Pipeline',
      'badge_priority': 'Active Priority',
      'badge_watchlist': 'ACTIVE WATCHLIST',
      'badge_stolen': 'STOLEN VEHICLE ALERT',
      'badge_mismatch': 'REGISTRY MISMATCH',
      'badge_verified': 'REGISTRY VERIFIED',
      'badge_challan': 'PENDING CHALLAN',
      'badge_active': 'ACTIVE',
      'badge_expired': 'EXPIRED',

      // ─── Labels ───
      'label_vehicle_reg': 'Vehicle Registration Number',
      'label_junction_node': 'Junction Camera Node',
      'label_rtsp_uri': 'RTSP Stream URI',
      'label_police_rank': 'Police Rank',
      'label_branch_unit': 'Branch / Unit',
      'label_email': 'Official Email Address',
      'label_badge_id': 'Service / Badge ID',
      'label_passcode': 'Passcode',
      'label_mfa_token': 'MFA Security Token (6-Digit)',
      'label_mobile': '10-Digit Mobile Number',
      'label_auth_method': 'Authentication Method',
      'label_officer_name': 'Officer Legal Full Name',
      'label_confirm_pass': 'Confirm Passcode',
      'label_citizen_name': 'Full Legal Name',
      'label_citizen_mobile': 'Mobile Number',
      'label_citizen_email': 'Email Address',
      'label_citizen_pass': 'Password (Min 6)',
      'label_confirm_password': 'Confirm Password',
      'label_sms_otp': 'SMS OTP Verification',

      // ─── Placeholders ───
      'placeholder_vehicle_reg': 'e.g. MH 12 DE 1433 or 22BH1234A',
      'placeholder_email': 'officer.name@mahapolice.gov.in',
      'placeholder_badge': 'e.g. MH-PI-4501 or MH-PSI-2104',
      'placeholder_otp': '000000',
      'placeholder_mobile': '9876543210',

      // ─── Descriptions ───
      'vehicle_lookup_desc': 'Query centralized VAHAN database across Maharashtra and national transport portals',
      'video_ingest_desc': 'Dissect traffic junction recording (.mp4) or bind edge camera RTSP stream',
      'detection_log_desc': 'Optical ANPR readings across Pune City CCTV camera network',
      'camera_network_desc': 'Active traffic junction optical sensors and edge ANPR processors',
      'watchlist_desc': 'Registered police bulletins for stolen vehicles, duplicate plates, and intercept warrants',
      'camera_status': '10 / 10 Connected',
      'quota_label': 'Quota: 10 / 10 remaining',
      'sample_label': 'Pune Context Samples:',

      // ─── Upload Zone ───
      'upload_title': 'Select or Drag Traffic CCTV Recording (.mp4)',
      'upload_sub': 'Hardware accelerated NVDEC decode | 8 FPS sampling',

      // ─── Pipeline Steps ───
      'step_frame': 'Frame Ingestion\n(8 FPS)',
      'step_vehicle': 'Vehicle\nLocalization',
      'step_anpr': 'ANPR Plate\nOCR',
      'step_vahan': 'VAHAN\nCross-Reference',
      'step_verdict': 'Discrepancy\nVerdict',
      'status_ready': 'Ready',

      // ─── Misc ───
      'no_records': 'No active records found.',
      'live_feed': 'Live Feed',

      // ─── Operational Verdicts ───
      'verdict_pass_title': 'VERDICT: REGISTRY VERIFIED — NORMAL PASS',
      'verdict_alert_title': 'VERDICT: REGISTRY MISMATCH / CLONED PLATE SUSPECT',
      'verdict_alert_desc': 'Physical vehicle attributes detected by optical ANPR sensor contradict official VAHAN specifications. Active Watchlist bulletin issued for junction intercept.',

      // ─── Auth Page ───
      'auth_gateway_title': 'Maharashtra Police Command Gateway',
      'auth_gateway_desc': 'Integrated Traffic & Surveillance Management System',
      'auth_police_tab': 'Police Personnel',
      'auth_citizen_tab': 'Citizen Services',
      'auth_mobile_otp': 'Registered Mobile + OTP',
      'auth_email_pass': 'Email + Password',
      'auth_email_hint': 'Accepted: @mahapolice.gov.in, @police.gov.in, @gov.in, @nic.in',
      'auth_otp_hint': 'Enter 6-digit authenticator or departmental OTP',
      'auth_citizen_verify': 'Verify & Enter Citizen Portal',
      'auth_citizen_create': 'Create Citizen Portal Account',
      'auth_provision': 'Provision Police Personnel Account',
      'auth_footer': 'Official Maharashtra Police Command & Public Service Gateway. Access monitored under IT Act Sec 66.',
      'auth_otp_sent': 'OTP dispatched to registered mobile. Valid for 10 minutes.',
      'auth_sms_otp_label': 'Or verify via SMS OTP',
      'auth_sms_send': 'Send SMS Code',
      'auth_sms_sending': 'Sending...',
      'auth_sms_sent': 'SMS OTP sent! Check your registered mobile.',
      'auth_sms_countdown': 'Resend in',
      'auth_sms_resend': 'Resend SMS OTP',

      // ─── Footer ───
      'footer_copyright': '© Government of Maharashtra. Content owned by Pune City Police Commissionerate.',
      'footer_browser': 'Best viewed in latest Chrome / Firefox / Edge, 1280x800 resolution',

      // ─── Police Branches ───
      'branch_traffic': 'Traffic Branch — Pune Police',
      'branch_crime': 'Crime Branch / CID',
      'branch_cyber': 'Cyber Crime Police Station',
      'branch_special': 'Special Branch',
      'branch_station': 'Police Station Law & Order',

      // ─── Minimap Controls (en) ───
      'map_title': 'SINGLE JUNCTION MINIMAP (2 PERPENDICULAR LANES)',
      'junction_node': 'JUNC-01 CENTRAL',
      'btn_auto': 'AUTO ATSC',
      'btn_force_lane_1': 'FLOW L1 (STOP L2)',
      'btn_force_lane_2': 'FLOW L2 (STOP L1)',
      'btn_all_red': 'ALL RED (STOP ALL)',
      'lane_1_label': 'LANE 1: NORTH-SOUTH',
      'lane_2_label': 'LANE 2: EAST-WEST',
      'pcu_load': 'PCU Load',
      'queue_len': 'Queue',

      // ─── Diff & Discrepancy Engine (en) ───
      'nav_diff_analysis': 'Corridor & ANPR Diff',
      'diff_title': 'Corridor Flow Differential & ANPR Discrepancy Engine',
      'diff_sub': 'Real-time multi-lane variance analysis, green-phase delta, and optical detection vs VAHAN registry diffs',
      'diff_corridor_flow': 'Live Corridor Flow Differential (Lane 1 vs Lane 2)',
      'diff_anpr_registry': 'ANPR Optical Reading vs VAHAN Registry Diff',
      'diff_pcu_metric': 'PCU Load Variance',
      'diff_queue_metric': 'Queue Backlog Delta',
      'diff_throughput_metric': 'Discharge Throughput',
      'diff_recommendation': 'ATSC Phase Balance Recommendation',
      'diff_pin_vehicle': 'Pin Vehicle for Diff Inspection',
      'diff_field_plate': 'License Plate OCR',
      'diff_field_class': 'Vehicle Classification',
      'diff_field_color': 'Physical Body Color',
      'diff_field_model': 'Make & Commercial Model',
      'diff_field_fuel': 'Fuel & Emission Class',
      'diff_field_verdict': 'Discrepancy Verdict',
      'diff_match': 'MATCH / VERIFIED',
      'diff_mismatch': 'MISMATCH / SUSPECT CLONE',
      'diff_btn_inspect': 'Inspect Vehicle Diff',
      'diff_btn_clear_pin': 'Unpin Vehicle',
      'diff_subtitle': 'Comparative real-time analytics between Corridor 1 (North-South) and Corridor 2 (East-West), plus automated ANPR vs VAHAN database cross-audit discrepancies.',
      'btn_refresh_diff': 'Resync Telemetry',
      'diff_lane1_title': 'CORRIDOR 1: JM ROAD (NS)',
      'diff_lane2_title': 'CORRIDOR 2: FC ROAD (EW)',
      'diff_metric_pcu': 'Active PCU Weight',
      'diff_metric_veh': 'Vehicles in Approach',
      'diff_metric_queue': 'Queue Tail Length',
      'diff_metric_throughput': 'Est. Flow Throughput',
      'diff_metric_balancing': 'Sub-Lane Distribution',
      'diff_metric_speed': 'Approach Velocity',
      'diff_center_title': 'CORRIDOR VARIANCE',
      'diff_queue_variance': 'Queue Variance',
      'diff_signal_bias': 'Adaptive ATSC Bias',
      'diff_anpr_vahan_inspector': 'ANPR Optical vs VAHAN National Registry Discrepancy Inspector',
      'diff_select_vehicle': 'Select Active Vehicle:',
      'diff_anpr_header': 'Live Optical ANPR Detection',
      'diff_field_corridor': 'Corridor Track',
      'diff_field_speed': 'Doppler Radar Speed',
      'diff_vahan_header': 'VAHAN National Registry Record',
      'diff_field_status': 'Insurance / Blacklist',
      'btn_export_audit': 'Export Audit Cert',

      // ─── Minimap Hover & Telemetry (en) ───
      'tip_speed': 'Speed',
      'tip_model': 'Model',
      'tip_corridor': 'Corridor',
      'tip_sublane': 'Sub-Lane',
      'tip_pcu': 'PCU Weight',
      'tip_fuel': 'Fuel / Engine',
      'tip_vahan': 'VAHAN Status',
      'tip_lane_sharing': 'Lane Sharing',
      'tip_sharing_desc': '2 Vehicles Abreast in Single Corridor',
      'tip_pinned': 'PINNED INSPECTION',
      'tip_click_hint': 'Click vehicle to pin details',
      'tip_model': 'Model',
      'tip_speed': 'Speed',
      'tip_corridor': 'Corridor',
      'tip_sublane': 'Sub-Lane',
      'tip_turn_intent': 'Turn Intent',
      'tip_turn_blinker': 'Turn Blinker',

      // ─── Sub-headers, KPIs, and Corridor Descriptions (en) ───
      'stat_vehicles': 'Vehicles',
      'btn_stop_lane_1': 'STOP LANE 1 (RED)',
      'btn_release_lane_1': 'RELEASE LANE 1 (FLOW)',
      'btn_stop_lane_2': 'STOP LANE 2 (RED)',
      'btn_release_lane_2': 'RELEASE LANE 2 (FLOW)',
      'sig_green': 'GREEN',
      'sig_amber': 'AMBER',
      'sig_red': 'RED',
      'sig_turn_left': '↰ LEFT ARROW GREEN',
      'sig_turn_right': '↱ RIGHT ARROW GREEN',
      'sig_turn_both': '↰↱ TURN ARROWS GREEN',
      'mode_auto_density': 'AUTO ATSC (DENSITY)',
      'mode_manual_l1_stopped': 'MANUAL: LANE 1 STOPPED',
      'mode_manual_l2_stopped': 'MANUAL: LANE 2 STOPPED',
      'mode_all_red_hold': 'ALL RED HOLD',
      'manual_takeover_active': 'Manual Takeover Active',
      'density_regulated': 'Density Regulated',
      'diff_verdict_title': 'VERDICT: 100% REGISTRY COMPLIANT — NO DISCREPANCY',
      'diff_verdict_sub': 'Optical vehicle dimensions, classification, and license plate match NIC VAHAN national motor database.',
      'kpi_total_fleet': 'TOTAL REGISTERED FLEET',
      'kpi_total_fleet_sub': 'Pune & Pimpri-Chinchwad Metro',
      'kpi_active_units': 'ACTIVE PATROL UNITS',
      'kpi_active_units_sub': '94.8% Operational Availability',
      'kpi_pcr_interceptors': 'POLICE PCR INTERCEPTORS',
      'kpi_pcr_sub': 'GPS Stream 1 Hz Active',
      'kpi_ems_units': 'EMERGENCY MEDICAL UNITS',
      'kpi_ems_sub': 'Green Corridor Priority Preempt',
      'kpi_heavy_recovery': 'HEAVY RECOVERY CRANES',
      'kpi_heavy_recovery_sub': 'Gridlock & Obstruction Clearance',
      'placeholder_filter_fleet': 'Filter unit callsign, plate, or sector...',
      'opt_all_sectors': 'All Patrol Sectors',
      'opt_sector_swargate': 'Sector 1: Swargate Zone',
      'opt_sector_jm': 'Sector 2: JM-FC Arterial',
      'opt_sector_hinjewadi': 'Sector 3: Hinjewadi IT Park',
      'opt_sector_airport': 'Sector 4: Airport Expressway',
      'opt_sector_nh4': 'Sector 5: Pune-Solapur NH Bypass',
      'opt_all_classes': 'All Vehicle Classes',
      'opt_class_pcr': 'Police PCR Interceptor',
      'opt_class_moto': 'Traffic Quick Strike Bike',
      'opt_class_tow': 'Heavy Tow Recovery',
      'opt_class_ems': 'Emergency Ambulance',
      'kpi_critical_alerts': 'CRITICAL ALERTS (ACTIVE)',
      'kpi_critical_alerts_sub': 'Priority Intercept Required',
      'kpi_warnings_review': 'WARNINGS UNDER REVIEW',
      'kpi_warnings_review_sub': 'E-Challan Pending Verification',
      'kpi_resolved_today': 'RESOLVED INCIDENTS TODAY',
      'kpi_resolved_today_sub': 'Clearance Rate 92.4%',
      'kpi_avg_dispatch': 'AVERAGE DISPATCH TIME',
      'kpi_avg_dispatch_sub': 'Target < 5.0 min',
      'placeholder_search_incidents': 'Search Incident ID, Plate, or Violation...',
      'opt_all_severities': 'All Severities',
      'opt_sev_critical': 'Critical',
      'opt_sev_warning': 'Warning',
      'opt_sev_advisory': 'Advisory',
      'opt_all_inc_types': 'All Incident Types',
      'opt_type_signal': 'Red Light Violation',
      'opt_type_speed': 'Over-speeding >85km/h',
      'opt_type_geofence': 'Geofence / Route Breach',
      'opt_type_wrong': 'Wrong-side Entry',
      'opt_type_stolen': 'Hotlist Vehicle Match',
      'th_severity': 'Severity',
      'th_contact': 'Contact',
      'gw_active_route_title': 'GREEN CORRIDOR ACTIVE: SASSOON HOSP → SWARGATE JUNC',
      'gw_active_route_sub': '5 ATSC Nodes Preempted to Continuous Green · Intersections Locked',
      'gw_eta_label': 'ETA TO DESTINATION',
      'btn_terminate_preemption': 'Terminate Preemption',
      'badge_atsc_wave': 'ATSC Priority Wave Protocol',
      'label_origin_facility': 'Origin Junction / Facility',
      'label_dest_corridor': 'Destination Corridor Junction',
      'label_priority_class': 'Emergency Priority Class',
      'label_callsign_plate': 'Vehicle Call Sign / Plate',
      'gw_auto_coord_hint': 'Automatically coordinates signal cycle offsets across corridor nodes',
      'badge_corridor_telemetry': '4 Corridors Live Telemetry',
      'corridor_jm_title': 'JM Road Arterial Corridor',
      'badge_optimal_flow': 'OPTIMAL FLOW',
      'corridor_jm_sub': 'Chhatrapati Sambhajinagar to Deccan Gymkhana (3.8 km · 6 ATSC Nodes)',
      'metric_avg_speed': 'AVG SPEED',
      'metric_pcu_density': 'PCU DENSITY',
      'metric_queue_time': 'QUEUE TIME',
      'btn_optimize_cycle': 'Optimize Cycle',
      'btn_flush_queue': 'Flush Queue',
      'corridor_fc_title': 'FC Road Commercial Belt',
      'badge_moderate_congestion': 'MODERATE CONGESTION',
      'corridor_fc_sub': 'Goodluck Chowk to Agriculture College (2.9 km · 5 ATSC Nodes)',
      'btn_extend_green': 'Extend Green +25s',
      'btn_vms_diversion': 'VMS Diversion',
      'corridor_swargate_title': 'Swargate Multi-Modal Interchange',
      'badge_heavy_congestion': 'HEAVY CONGESTION',
      'corridor_swargate_sub': 'Shivaji Road × Satara Road Transit Hub (4.2 km · 8 ATSC Nodes)',
      'btn_auto_clearance': 'Auto Clearance',
      'btn_dispatch_tow': 'Dispatch Tow Unit',
      'corridor_airport_title': 'Airport Transit Expressway',
      'badge_free_flow': 'FREE FLOW',
      'corridor_airport_sub': 'Airport 509 Chowk to Viman Nagar (7.1 km · 4 ATSC Nodes)',
      'btn_check_radar': 'Check Speed Radar',
      'btn_progression_banding': 'Progression Banding',
      'kpi_total_iot': 'TOTAL IOT ASSETS',
      'kpi_field_nodes': 'Field Connected Nodes',
      'kpi_atsc_controllers': 'JCT ATSC CONTROLLERS',
      'kpi_online_heartbeat': '100% Online Heartbeat',
      'kpi_anpr_nodes': 'ANPR 4K OPTICAL NODES',
      'kpi_nvdec_edge': 'NVDEC Edge GPU AI Active',
      'kpi_speed_traps': 'RADAR SPEED TRAPS',
      'kpi_laser_calibrated': 'Laser Calibrated',
      'kpi_vms_signs': 'VARIABLE MESSAGE SIGNS',
      'kpi_led_matrix': 'LED Matrix Operational',
      'placeholder_filter_asset': 'Filter Asset Tag, IP, or Model...',
      'opt_all_hw_cats': 'All Hardware Categories',
      'opt_hw_atsc': 'Junction ATSC Controllers',
      'opt_hw_anpr': 'Edge ANPR Cameras',
      'opt_hw_radar': 'Laser Speed Sensors',
      'opt_hw_vms': 'LED Variable Message Signs',
      'opt_hw_ecb': 'Emergency Call Boxes',
      'btn_refresh_diagnostics': 'Refresh Diagnostics',
      'kpi_watch_commander': 'ACTIVE WATCH COMMANDER',
      'kpi_watch_commander_sub': 'Badge #MH-PN-4402 (Console 03)',
      'kpi_officers_shift': 'OFFICERS ON SHIFT',
      'kpi_shift_hours': 'Day Shift (08:00 - 16:00 IST)',
      'kpi_sector_units': 'FIELD SECTOR UNITS',
      'kpi_sector_units_sub': 'PCR + Motorcycle Interceptors',
      'kpi_tactical_radio': 'TACTICAL RADIO NET',
      'kpi_tactical_radio_sub': 'All 4 Channels Encrypted & Synced',
      'placeholder_filter_staff': 'Filter officer name, badge, or radio channel...',
      'opt_all_duty_statuses': 'All Duty Statuses',
      'opt_status_on_duty': 'On Duty',
      'opt_status_on_patrol': 'Field Patrol',
      'opt_status_dispatched': 'Dispatched',
      'opt_status_standby': 'Standby',
      'btn_broadcast_tactical': 'Broadcast Tactical Alert',
      'logs_daemon_stream': 'vims-iccc-daemon.service — live journalctl stream',
      'btn_clear_logs': 'Clear',
      'command_unit_subtitle': 'Pune City Police — Traffic Branch & Central Surveillance Desk',
      'lbl_vahan_queries': 'VAHAN Registry Queries',
      'lbl_stolen_bulletins': 'Stolen Vehicle Bulletins',
      'lbl_watchlist_hits': 'Active Watchlist Hits',
      'lbl_cameras_online': 'Junction Cameras Online',
      'card_quick_controls': 'Quick Controls',
      'btn_goto_lookup': 'Query Vehicle Registry',
      'btn_goto_ingest': 'Ingest CCTV Footage',
      'btn_goto_watchlist': 'Active Watchlist',
      'card_priority_alerts': 'Recent Priority Alerts',
      'badge_live_feed': 'Live Feed',
      'card_atsc_telemetry': 'Live Junction Telemetry: ATSC Node-01',
      'lbl_phase_status': 'Current Phase Status',
      'lbl_phase_elapsed': 'Phase Elapsed Time',
      'lbl_min_green_remain': 'Min Green Remaining',
      'lbl_signal_cycle': 'Signal Cycle',
      'corridor_ns_name': 'North–South Corridor',
      'corridor_ew_name': 'East–West Corridor',
      'lbl_pcu_demand': 'PCU Demand',
      'card_camera_feed': 'Junction Camera Feed & Traffic Regulation Input',
      'badge_predownloaded': 'Pre-Downloaded Feed',
      'badge_adaptive_atsc': 'Adaptive ATSC',
    },

    hi: {
      // ─── System Header ───
      'sys_tagline': 'वाहन आसूचना एवं गतिशीलता ट्रैकिंग प्रणाली',
      'sys_title': 'विम्स आईसीसीसी',
      'sys_subtitle': 'एकीकृत कमांड एवं नियंत्रण केंद्र',
      'sys_status_secure': 'सुरक्षित',
      'sys_status_active': 'आईसीसीसी पुणे नोड: सक्रिय',
      'sys_status_cit': 'नागरिक सेवा पोर्टल: सक्रिय',
      'lang_toggle': 'हि | EN',

      // ─── Top Navigation ───
      'topnav_dashboard': 'डैशबोर्ड',
      'topnav_fleet_map': 'बेड़ा मानचित्र',
      'topnav_vehicles': 'वाहन',
      'topnav_alerts': 'अलर्ट',
      'topnav_reports': 'रिपोर्ट',
      'topnav_analytics': 'विश्लेषण',
      'topnav_security': 'सुरक्षा',
      'topnav_help': 'सहायता',

      // ─── Sidebar Navigation ───
      'nav_live_tracking': 'लाइव ट्रैकिंग',
      'nav_fleet_overview': 'बेड़ा अवलोकन',
      'nav_incident_logs': 'घटना लॉग',
      'nav_route_mgmt': 'मार्ग प्रबंधन',
      'nav_asset_database': 'संपत्ति डेटाबेस',
      'nav_staff': 'कर्मचारी',
      'nav_system_logs': 'सिस्टम लॉग',
      'nav_command_centre': 'कमांड सेंटर',
      'nav_vehicle_lookup': 'वाहन रजिस्ट्री खोज',
      'nav_video_ingest': 'सीसीटीवी वीडियो विश्लेषण',
      'nav_detection_log': 'पहचान ऑडिट लॉग',
      'nav_camera_network': 'जंक्शन कैमरे (पुणे सीसीटीवी ग्रिड)',
      'nav_watchlist': 'सक्रिय निगरानी एवं चोरी वाहन',
      'nav_citizen_home': 'पोर्टल मुख्य पृष्ठ',
      'nav_citizen_lookup': 'वाहन स्थिति जांचें',
      'nav_citizen_report': 'घटना दर्ज करें',
      'nav_citizen_grievance': 'शिकायत स्थिति ट्रैक करें',

      // ─── New Relatable Tab Titles & Labels (hi) ───
      'fleet_overview_title': 'सक्रिय बेड़ा सूची एवं तैनाती',
      'fleet_overview_sub': 'पुणे महानगरीय क्षेत्र में वास्तविक समय टेलीमेट्री, गश्ती क्षेत्र और तत्परता स्थिति',
      'th_unit_id': 'यूनिट आईडी',
      'th_class_model': 'वर्ग / मॉडल',
      'th_sector_zone': 'आवंटित क्षेत्र',
      'th_commander': 'प्रभारी अधिकारी',
      'th_telemetry': 'गति / ईंधन',
      'btn_export_fleet': 'बेड़ा डेटा निर्यात',
      'btn_track_live': 'लाइव ट्रैक करें',

      'incident_logs_title': 'यातायात एवं सुरक्षा घटना खाता',
      'incident_logs_sub': 'लाइव प्रेषण लॉग, एएनपीआर विसंगति अलर्ट और प्रवर्तन कार्रवाई',
      'th_incident_id': 'घटना आईडी',
      'th_violation': 'उल्लंघन / विसंगति',
      'th_unit_dispatched': 'प्रेषित यूनिट',
      'btn_issue_challan': 'ई-चालान जारी करें',
      'btn_dispatch_unit': 'गश्ती दल भेजें',

      'route_mgmt_title': 'कॉरिडोर प्रवाह एवं स्वायत्त हरित गलियारा',
      'route_mgmt_sub': 'आपातकालीन पूर्व-अधिकार, पारगमन प्रगति और भीड़भाड़ नियंत्रण',
      'btn_trigger_green_wave': 'स्वायत्त हरित गलियारा सक्रिय करें',
      'card_green_wave': 'आपातकालीन सिग्नल पूर्व-अधिकार प्रेषक',
      'card_arterial_status': 'पुणे मेट्रो प्रमुख गलियारे',

      'asset_database_title': 'आईसीसीसी स्मार्ट इन्फ्रास्ट्रक्चर एवं संपत्ति खाता',
      'asset_database_sub': 'आईओटी सेंसर, सीसीटीवी नोड्स और एटीएससी नियंत्रकों की स्थिति एवं नैदानिक',
      'th_asset_tag': 'संपत्ति टैग',
      'th_equipment': 'उपकरण विनिर्देश',
      'th_ip_mac': 'आईपी / मैक पता',
      'th_firmware': 'फर्मवेयर',
      'th_uptime': 'अपटाइम स्वास्थ्य',

      'staff_title': 'कमांड कार्मिक एवं फील्ड ट्रैफिक ड्यूटी रोस्टर',
      'staff_sub': 'अधिकारी ड्यूटी स्थिति, सामरिक रेडियो चैनल, गश्ती क्षेत्र और पाली कार्य',
      'th_badge': 'बैज संख्या',
      'th_officer': 'अधिकारी का नाम व पद',
      'th_assignment': 'सौंपा गया कार्य',
      'th_radio_ch': 'रेडियो चैनल',
      'btn_radio_call': 'रेडियो कॉल',

      'system_logs_title': 'सिस्टम टेलीमेट्री एवं सुरक्षा ऑडिट खाता',
      'system_logs_sub': 'अपरिवर्तनीय परिचालन ऑडिट ट्रेल, कर्नेल इवेंट्स, सिग्नल साइकिल और एसएमएस गेटवे लॉग',
      'btn_pause_feed': 'फीड रोकें',
      'btn_resume_feed': 'फीड जारी रखें',
      'btn_export_audit': 'ऑडिट ट्रेल निर्यात',

      // ─── Legend ───
      'legend_active': 'सक्रिय',
      'legend_alert': 'चेतावनी',
      'legend_warning': 'सावधानी',

      // ─── Sign Out ───
      'sign_out': 'लॉग आउट',
      'sign_in': 'लॉग इन',
      'create_account': 'खाता बनाएं',
      'register_node': 'अधिकारी पंजीकृत करें',

      // ─── Map Section ───
      'map_title': 'एकल जंक्शन मिनिमैप (2 लंबवत लेन)',
      'junction_node': 'जंक्शन-01 सेंट्रल',
      'lane_1_label': 'लेन 1: उत्तर-दक्षिण',
      'lane_2_label': 'लेन 2: पूर्व-पश्चिम',
      'btn_auto': 'ऑटो ATSC',
      'btn_force_lane_1': 'लेन 1 चालू (उ-द)',
      'btn_force_lane_2': 'लेन 2 चालू (पू-प)',
      'btn_all_red': 'सभी लाल',
      'pcu_load': 'PCU भार',
      'queue_len': 'कतार',

      // ─── Filters ───
      'filter_search_vehicle': 'वाहन आईडी खोजें',
      'filter_vehicle_type': 'वाहन प्रकार',
      'filter_heavy': 'भारी',
      'filter_commercial': 'व्यावसायिक',
      'filter_private': 'निजी',
      'filter_status': 'स्थिति',
      'filter_active': 'सक्रिय',
      'filter_alert': 'चेतावनी',
      'filter_warning_opt': 'सावधानी',
      'filter_region': 'क्षेत्र',
      'filter_pune': 'पुणे शहर',
      'filter_nh': 'राष्ट्रीय राजमार्ग',
      'filter_suburban': 'उपनगरीय',
      'filter_time_range': 'समय सीमा',
      'filter_1h': 'पिछला 1 घंटा',
      'filter_6h': 'पिछले 6 घंटे',
      'filter_24h': 'पिछले 24 घंटे',
      'filter_all_junctions': 'सभी जंक्शन नोड',
      'filter_all_statuses': 'सभी स्थितियां',
      'filter_verified': 'रजिस्ट्री सत्यापित',
      'filter_mismatch': 'रजिस्ट्री विसंगति',
      'filter_stolen': 'चोरी वाहन चेतावनी',
      'filter_challan': 'लंबित चालान',

      // ─── Stats Cards ───
      'stat_active_fleet': 'सक्रिय बेड़ा',
      'stat_vehicles_on_road': 'सड़क पर वाहन',
      'stat_operational': 'चालू',
      'stat_total_alerts': 'कुल अलर्ट',
      'stat_critical': 'गंभीर',
      'stat_warnings': 'चेतावनियां',
      'stat_vehicle_utilization': 'वाहन उपयोग',

      // ─── Utilization Legend ───
      'util_heavy': 'भारी',
      'util_commercial': 'व्यावसायिक',
      'util_private': 'निजी',

      // ─── Table Headers ───
      'th_time': 'समय',
      'th_time_ist': 'समय (IST)',
      'th_alert_level': 'चेतावनी स्तर',
      'th_vehicle_id': 'वाहन आईडी',
      'th_location': 'स्थान',
      'th_type': 'प्रकार',
      'th_id': 'आईडी',
      'th_vehicle': 'वाहन',
      'th_status': 'स्थिति',
      'th_junction_node': 'जंक्शन नोड',
      'th_plate_number': 'प्लेट नंबर',
      'th_vehicle_type': 'वाहन सिल्हूट',
      'th_color': 'दृश्य रंग',
      'th_registry': 'रजिस्ट्री रिकॉर्ड',
      'th_node_id': 'नोड आईडी',
      'th_junction': 'जंक्शन / कॉरिडोर',
      'th_zone': 'ज़ोन',
      'th_resolution': 'रिज़ॉल्यूशन एवं FPS',
      'th_hardware': 'एज हार्डवेयर',
      'th_bulletin_id': 'बुलेटिन आईडी',
      'th_vehicle_plate': 'वाहन प्लेट',
      'th_model': 'पंजीकृत मॉडल',
      'th_station': 'पुलिस थाना',
      'th_fir': 'एफआईआर / संदर्भ',
      'th_number_plate': 'नंबर प्लेट',
      'th_observed_vehicle': 'दृश्य वाहन',
      'th_vahan_record': 'वाहन रिकॉर्ड',
      'th_operational_status': 'संचालन स्थिति',
      'th_action': 'कार्रवाई',

      // ─── Alert Types ───
      'alert_critical': 'गंभीर',
      'alert_warning': 'चेतावनी',
      'type_speeding': 'अति-गति',
      'type_route_deviation': 'मार्ग विचलन',
      'type_unauthorized_stop': 'अनधिकृत रुकावट',
      'type_geofence_breach': 'भौगोलिक सीमा उल्लंघन',

      // ─── Locations ───
      'loc_ring_road': 'रिंग रोड',
      'loc_nh8': 'एनएच8',
      'loc_swargate': 'स्वारगेट जंक्शन',
      'loc_hinjewadi': 'हिंजेवाडी फेज-1',
      'loc_noida_sec18': 'नोएडा सेक्टर 18',
      'loc_wakad': 'वाकड पुल',
      'loc_airport_rd': 'एयरपोर्ट रोड',

      // ─── Status Badges ───
      'status_dispatched': 'प्रेषित',
      'status_resolved': 'समाधान',
      'status_investigating': 'जांच चालू',

      // ─── Card Titles ───
      'card_active_alerts_feed': 'सक्रिय अलर्ट फीड',
      'card_recent_incidents': 'हाल की घटनाएं',
      'card_registry_search': 'राष्ट्रीय परिवहन रजिस्ट्री खोज',
      'card_rtsp_binding': 'पुणे ट्रैफिक सीसीटीवी स्ट्रीम बाइंडिंग (NVDEC हार्डवेयर डिकोड)',
      'card_footage_dissection': 'रिकॉर्डेड सीसीटीवी घटना फुटेज विश्लेषण (.mp4)',
      'card_detection_lifecycle': 'पहचान जीवनचक्र',
      'card_junction_filter': 'जंक्शन फिल्टर',
      'card_camera_telemetry': 'कैमरा नोड टेलीमेट्री',
      'card_hotlist': 'पुलिस हॉटलिस्ट बुलेटिन (पुणे पुलिस आयुक्तालय)',

      // ─── Buttons ───
      'btn_view_details': 'विवरण देखें',
      'btn_query_registry': 'वाहन रजिस्ट्री खोजें',
      'btn_execute_pipeline': '5-चरणीय पहचान पाइपलाइन चलाएं',
      'btn_submit_report': 'पुलिस कमान में औपचारिक शिकायत दर्ज करें',
      'btn_search_record': 'अभिलेख खोजें',
      'btn_authenticate': 'प्रमाणीकरण कर कमांड नोड में प्रवेश करें',
      'btn_get_otp': 'ओटीपी प्राप्त करें',
      'btn_send_sms_otp': 'एसएमएस ओटीपी भेजें',
      'btn_bind_stream': 'कैमरा स्ट्रीम को एज डेमन से जोड़ें',

      // ─── Badges ───
      'badge_rtsp': 'आरटीएसपी पाइपलाइन',
      'badge_priority': 'सक्रिय प्राथमिकता',
      'badge_watchlist': 'सक्रिय निगरानी सूची',
      'badge_stolen': 'चोरी वाहन अलर्ट',
      'badge_mismatch': 'पंजीकरण विसंगति',
      'badge_verified': 'पंजीकरण सत्यापित',
      'badge_challan': 'लंबित चालान',
      'badge_active': 'सक्रिय',
      'badge_expired': 'समाप्त',

      // ─── Labels ───
      'label_vehicle_reg': 'वाहन पंजीकरण संख्या',
      'label_junction_node': 'जंक्शन कैमरा नोड',
      'label_rtsp_uri': 'आरटीएसपी स्ट्रीम URI',
      'label_police_rank': 'पुलिस पद',
      'label_branch_unit': 'शाखा / इकाई',
      'label_email': 'आधिकारिक ईमेल पता',
      'label_badge_id': 'सेवा / बैज आईडी',
      'label_passcode': 'पासकोड',
      'label_mfa_token': 'एमएफए सुरक्षा टोकन (6-अंक)',
      'label_mobile': '10-अंकीय मोबाइल नंबर',
      'label_auth_method': 'प्रमाणीकरण विधि',
      'label_officer_name': 'अधिकारी का पूरा कानूनी नाम',
      'label_confirm_pass': 'पासकोड की पुष्टि करें',
      'label_citizen_name': 'पूरा कानूनी नाम',
      'label_citizen_mobile': 'मोबाइल नंबर',
      'label_citizen_email': 'ईमेल पता',
      'label_citizen_pass': 'पासवर्ड (न्यूनतम 6)',
      'label_confirm_password': 'पासवर्ड की पुष्टि करें',
      'label_sms_otp': 'एसएमएस ओटीपी सत्यापन',

      // ─── Placeholders ───
      'placeholder_vehicle_reg': 'उदा. MH 12 DE 1433 या 22BH1234A',
      'placeholder_email': 'officer.name@mahapolice.gov.in',
      'placeholder_badge': 'उदा. MH-PI-4501 या MH-PSI-2104',
      'placeholder_otp': '000000',
      'placeholder_mobile': '9876543210',

      // ─── Descriptions ───
      'vehicle_lookup_desc': 'महाराष्ट्र एवं राष्ट्रीय परिवहन पोर्टल पर केंद्रीकृत वाहन डेटाबेस की खोज करें',
      'video_ingest_desc': 'ट्रैफिक जंक्शन रिकॉर्डिंग (.mp4) का विश्लेषण या एज कैमरा RTSP स्ट्रीम बाइंड करें',
      'detection_log_desc': 'पुणे शहर सीसीटीवी कैमरा नेटवर्क पर ऑप्टिकल ANPR रीडिंग',
      'camera_network_desc': 'सक्रिय ट्रैफिक जंक्शन ऑप्टिकल सेंसर और एज ANPR प्रोसेसर',
      'watchlist_desc': 'चोरी वाहन, डुप्लिकेट प्लेट, और इंटरसेप्ट वारंट के लिए पुलिस बुलेटिन',
      'camera_status': '10 / 10 कनेक्टेड',
      'quota_label': 'कोटा: 10 / 10 शेष',
      'sample_label': 'पुणे संदर्भ नमूने:',

      // ─── Upload Zone ───
      'upload_title': 'ट्रैफिक सीसीटीवी रिकॉर्डिंग (.mp4) चुनें या खींचें',
      'upload_sub': 'हार्डवेयर त्वरित NVDEC डिकोड | 8 FPS सैंपलिंग',

      // ─── Pipeline Steps ───
      'step_frame': 'फ्रेम इनजेस्ट\n(8 FPS)',
      'step_vehicle': 'वाहन\nलोकलाइज़ेशन',
      'step_anpr': 'ANPR प्लेट\nOCR',
      'step_vahan': 'वाहन\nक्रॉस-रेफ़रेंस',
      'step_verdict': 'विसंगति\nनिर्णय',
      'status_ready': 'तैयार',

      // ─── Misc ───
      'no_records': 'कोई सक्रिय रिकॉर्ड नहीं मिला।',
      'live_feed': 'लाइव फीड',

      // ─── Operational Verdicts ───
      'verdict_pass_title': 'निर्णय: रजिस्ट्री सत्यापित — सामान्य निकास',
      'verdict_alert_title': 'निर्णय: पंजीकरण विसंगति / क्लोन प्लेट संदिग्ध',
      'verdict_alert_desc': 'कैमरे द्वारा दर्ज वाहन के भौतिक लक्षण आधिकारिक वाहन रजिस्ट्री रिकॉर्ड से मेल नहीं खाते हैं। जंक्शन पर रोकने हेतु सक्रिय निगरानी सूचना जारी।',

      // ─── Auth Page ───
      'auth_gateway_title': 'महाराष्ट्र पुलिस कमांड गेटवे',
      'auth_gateway_desc': 'एकीकृत यातायात एवं निगरानी प्रबंधन प्रणाली',
      'auth_police_tab': 'पुलिस कर्मचारी',
      'auth_citizen_tab': 'नागरिक सेवाएं',
      'auth_mobile_otp': 'पंजीकृत मोबाइल + ओटीपी',
      'auth_email_pass': 'ईमेल + पासवर्ड',
      'auth_email_hint': 'स्वीकृत: @mahapolice.gov.in, @police.gov.in, @gov.in, @nic.in',
      'auth_otp_hint': '6-अंकीय प्रमाणक या विभागीय ओटीपी दर्ज करें',
      'auth_citizen_verify': 'सत्यापित करें एवं नागरिक पोर्टल में प्रवेश करें',
      'auth_citizen_create': 'नागरिक पोर्टल खाता बनाएं',
      'auth_provision': 'पुलिस कार्मिक खाता प्रदान करें',
      'auth_footer': 'आधिकारिक महाराष्ट्र पुलिस कमांड एवं जन सेवा गेटवे। आईटी अधिनियम धारा 66 के तहत निगरानी।',
      'auth_otp_sent': 'ओटीपी पंजीकृत मोबाइल पर भेजा गया। 10 मिनट के लिए वैध।',
      'auth_sms_otp_label': 'या एसएमएस ओटीपी से सत्यापित करें',
      'auth_sms_send': 'एसएमएस कोड भेजें',
      'auth_sms_sending': 'भेज रहे हैं...',
      'auth_sms_sent': 'एसएमएस ओटीपी भेजा गया! अपना मोबाइल जांचें।',
      'auth_sms_countdown': 'पुनः भेजें',
      'auth_sms_resend': 'एसएमएस ओटीपी पुनः भेजें',

      // ─── Footer ───
      'footer_copyright': '© महाराष्ट्र सरकार। सामग्री पुणे शहर पुलिस आयुक्तालय द्वारा स्वामित्व।',
      'footer_browser': 'नवीनतम Chrome / Firefox / Edge, 1280x800 रिज़ॉल्यूशन में सर्वोत्तम देखा जा सकता है',

      // ─── Police Branches ───
      'branch_traffic': 'यातायात शाखा — पुणे पुलिस',
      'branch_crime': 'अपराध शाखा / सीआईडी',
      'branch_cyber': 'साइबर अपराध पुलिस थाना',
      'branch_special': 'विशेष शाखा',
      'branch_station': 'पुलिस थाना कानून एवं व्यवस्था',

      // ─── Minimap Controls (hi) ───
      'map_title': 'एकल जंक्शन मिनीमैप (2 लंबवत लेन)',
      'junction_node': 'जंक्शन-01 केंद्रीय',
      'btn_auto': 'ऑटो एटीएससी',
      'btn_force_lane_1': 'लेन 1 प्रवाह (लेन 2 रोकें)',
      'btn_force_lane_2': 'लेन 2 प्रवाह (लेन 1 रोकें)',
      'btn_all_red': 'सभी लाल (सभी रोकें)',
      'lane_1_label': 'लेन 1: उत्तर-दक्षिण',
      'lane_2_label': 'लेन 2: पूर्व-पश्चिम',
      'pcu_load': 'पीसीयू भार',
      'queue_len': 'कतार',

      // ─── Diff & Discrepancy Engine (hi) ───
      'nav_diff_analysis': 'कॉरिडोर एवं एएनपीआर अंतर',
      'diff_title': 'कॉरिडोर प्रवाह अंतर एवं एएनपीआर विसंगति इंजन',
      'diff_sub': 'वास्तविक समय बहु-लेन भिन्नता विश्लेषण, सिग्नल डेल्टा और ऑप्टिकल पहचान बनाम वाहन रजिस्ट्री अंतर',
      'diff_corridor_flow': 'लाइव कॉरिडोर प्रवाह अंतर (लेन 1 बनाम लेन 2)',
      'diff_anpr_registry': 'एएनपीआर ऑप्टिकल रीडिंग बनाम वाहन रजिस्ट्री अंतर',
      'diff_pcu_metric': 'पीसीयू भार अंतर',
      'diff_queue_metric': 'कतार बैकलाग डेल्टा',
      'diff_throughput_metric': 'निकास थ्रूपुट',
      'diff_recommendation': 'सिग्नल चरण संतुलन अनुशंसा',
      'diff_pin_vehicle': 'अंतर जांच हेतु वाहन पिन करें',
      'diff_field_plate': 'लाइसेंस प्लेट ओसीआर',
      'diff_field_class': 'वाहन वर्गीकरण',
      'diff_field_color': 'भौतिक शरीर का रंग',
      'diff_field_model': 'मेक एवं वाणिज्यिक मॉडल',
      'diff_field_fuel': 'ईंधन एवं उत्सर्जन वर्ग',
      'diff_field_verdict': 'विसंगति निर्णय',
      'diff_match': 'सत्यापित / मेल खाता है',
      'diff_mismatch': 'विसंगति / क्लोन प्लेट संदिग्ध',
      'diff_btn_inspect': 'वाहन अंतर की जांच करें',
      'diff_btn_clear_pin': 'वाहन अनपिन करें',
      'diff_subtitle': 'कॉरिडोर 1 (उत्तर-दक्षिण) और कॉरिडोर 2 (पूर्व-पश्चिम) के बीच तुलनात्मक वास्तविक समय विश्लेषण, साथ ही स्वचालित एएनपीआर बनाम वाहन डेटाबेस क्रॉस-ऑडिट विसंगतियां।',
      'btn_refresh_diff': 'टेलीमेट्री पुनः सिंक करें',
      'diff_lane1_title': 'कॉरिडोर 1: जेएम रोड (उत्तर-दक्षिण)',
      'diff_lane2_title': 'कॉरिडोर 2: एफसी रोड (पूर्व-पश्चिम)',
      'diff_metric_pcu': 'सक्रिय पीसीयू भार',
      'diff_metric_veh': 'पहुंच में वाहन',
      'diff_metric_queue': 'कतार की लंबाई',
      'diff_metric_throughput': 'अनुमानित प्रवाह थ्रूपुट',
      'diff_metric_balancing': 'उप-लेन वितरण',
      'diff_metric_speed': 'पहुंच गति',
      'diff_center_title': 'कॉरिडोर भिन्नता',
      'diff_queue_variance': 'कतार भिन्नता',
      'diff_signal_bias': 'अनुकूली एटीएससी पूर्वाग्रह',
      'diff_anpr_vahan_inspector': 'एएनपीआर ऑप्टिकल बनाम वाहन राष्ट्रीय रजिस्ट्री विसंगति निरीक्षक',
      'diff_select_vehicle': 'सक्रिय वाहन चुनें:',
      'diff_anpr_header': 'लाइव ऑप्टिकल एएनपीआर पहचान',
      'diff_field_corridor': 'कॉरिडोर ट्रैक',
      'diff_field_speed': 'डॉपलर रडार गति',
      'diff_vahan_header': 'वाहन राष्ट्रीय रजिस्ट्री रिकॉर्ड',
      'diff_field_status': 'बीमा / ब्लैकलिस्ट स्थिति',
      'btn_export_audit': 'ऑडिट प्रमाणपत्र निर्यात करें',

      // ─── Minimap Hover & Telemetry (hi) ───
      'tip_speed': 'गति',
      'tip_model': 'मॉडल',
      'tip_corridor': 'कॉरिडोर',
      'tip_sublane': 'उप-लेन',
      'tip_pcu': 'पीसीयू भार',
      'tip_fuel': 'ईंधन / इंजन',
      'tip_vahan': 'वाहन स्थिति',
      'tip_lane_sharing': 'लेन साझाकरण',
      'tip_sharing_desc': 'एकल कॉरिडोर में 2 वाहन अगल-बगल',
      'tip_pinned': 'पिन किया गया निरीक्षण',
      'tip_click_hint': 'विवरण पिन करने हेतु वाहन पर क्लिक करें',
      'tip_model': 'मॉडल',
      'tip_speed': 'गति',
      'tip_corridor': 'कॉरिडोर',
      'tip_sublane': 'उप-लेन',
      'tip_turn_intent': 'मोड़ इरादा',
      'tip_turn_blinker': 'मोड़ ब्लिंकर',

      // ─── Sub-headers, KPIs, and Corridor Descriptions (hi) ───
      'stat_vehicles': 'वाहन',
      'btn_stop_lane_1': 'लेन १ रोकें (लाल)',
      'btn_release_lane_1': 'लेन १ छोड़ें (प्रवाह)',
      'btn_stop_lane_2': 'लेन २ रोकें (लाल)',
      'btn_release_lane_2': 'लेन २ छोड़ें (प्रवाह)',
      'sig_green': 'हरा',
      'sig_amber': 'पीला',
      'sig_red': 'लाल',
      'sig_turn_left': '↰ बायाँ तीर हरा',
      'sig_turn_right': '↱ दायाँ तीर हरा',
      'sig_turn_both': '↰↱ मोड़ तीर हरे',
      'mode_auto_density': 'स्वचालित एटीएससी (घनत्व)',
      'mode_manual_l1_stopped': 'मैन्युअल: लेन १ रुकी हुई',
      'mode_manual_l2_stopped': 'मैन्युअल: लेन २ रुकी हुई',
      'mode_all_red_hold': 'सर्व-लाल ठहराव',
      'manual_takeover_active': 'मैन्युअल नियंत्रण सक्रिय',
      'density_regulated': 'घनत्व नियंत्रित',
      'diff_verdict_title': 'निर्णय: १००% रजिस्ट्री अनुपालक — कोई विसंगति नहीं',
      'diff_verdict_sub': 'ऑप्टिकल वाहन आयाम, वर्गीकरण और लाइसेंस प्लेट एनआईसी वाहन राष्ट्रीय मोटर डेटाबेस से मेल खाते हैं।',
      'kpi_total_fleet': 'कुल पंजीकृत बेड़ा',
      'kpi_total_fleet_sub': 'पुणे एवं पिंपरी-चिंचवड़ मेट्रो',
      'kpi_active_units': 'सक्रिय गश्ती इकाइयाँ',
      'kpi_active_units_sub': '९४.८% परिचालन उपलब्धता',
      'kpi_pcr_interceptors': 'पुलिस पीसीआर इंटरसेप्टर',
      'kpi_pcr_sub': 'जीपीएस स्ट्रीम १ हर्ट्ज़ सक्रिय',
      'kpi_ems_units': 'आपातकालीन चिकित्सा इकाइयाँ',
      'kpi_ems_sub': 'ग्रीन कॉरिडोर प्राथमिकता नियंत्रण',
      'kpi_heavy_recovery': 'भारी रिकवरी क्रेन',
      'kpi_heavy_recovery_sub': 'जाम एवं अवरोध निवारण',
      'placeholder_filter_fleet': 'इकाई कॉलसाइन, प्लेट या सेक्टर फ़िल्टर करें...',
      'opt_all_sectors': 'सभी गश्ती सेक्टर',
      'opt_sector_swargate': 'सेक्टर १: स्वारगेट ज़ोन',
      'opt_sector_jm': 'सेक्टर २: जेएम-एफसी आर्टेरियल',
      'opt_sector_hinjewadi': 'सेक्टर ३: हिंजवड़ी आईटी पार्क',
      'opt_sector_airport': 'सेक्टर ४: एयरपोर्ट एक्सप्रेसवे',
      'opt_sector_nh4': 'सेक्टर ५: पुणे-सोलापुर राष्ट्रीय राजमार्ग बाईपास',
      'opt_all_classes': 'सभी वाहन वर्ग',
      'opt_class_pcr': 'पुलिस पीसीआर इंटरसेप्टर',
      'opt_class_moto': 'ट्रैफिक क्विक स्ट्राइक बाइक',
      'opt_class_tow': 'भारी टो रिकवरी',
      'opt_class_ems': 'आपातकालीन एम्बुलेंस',
      'kpi_critical_alerts': 'गंभीर अलर्ट (सक्रिय)',
      'kpi_critical_alerts_sub': 'प्राथमिकता इंटरसेप्ट आवश्यक',
      'kpi_warnings_review': 'समीक्षाधीन चेतावनियाँ',
      'kpi_warnings_review_sub': 'ई-चालान सत्यापन लंबित',
      'kpi_resolved_today': 'आज निपटाए गए मामले',
      'kpi_resolved_today_sub': 'निपटान दर ९२.४%',
      'kpi_avg_dispatch': 'औसत प्रेषण समय',
      'kpi_avg_dispatch_sub': 'लक्ष्य < ५.० मिनट',
      'placeholder_search_incidents': 'घटना आईडी, प्लेट या उल्लंघन खोजें...',
      'opt_all_severities': 'सभी गंभीरता स्तर',
      'opt_sev_critical': 'गंभीर',
      'opt_sev_warning': 'चेतावनी',
      'opt_sev_advisory': 'परामर्श',
      'opt_all_inc_types': 'सभी घटना प्रकार',
      'opt_type_signal': 'लाल बत्ती उल्लंघन',
      'opt_type_speed': 'अति-गति >८५ किमी/घंटा',
      'opt_type_geofence': 'जियोफेंस / मार्ग उल्लंघन',
      'opt_type_wrong': 'गलत दिशा प्रवेश',
      'opt_type_stolen': 'हॉटलिस्ट वाहन मेल',
      'th_severity': 'गंभीरता',
      'th_contact': 'संपर्क',
      'gw_active_route_title': 'ग्रीन कॉरिडोर सक्रिय: ससून अस्पताल → स्वारगेट जंक्शन',
      'gw_active_route_sub': '५ एटीएससी नोड्स को लगातार हरे रंग पर नियंत्रित किया गया · चौराहे लॉक हैं',
      'gw_eta_label': 'गंतव्य तक अनुमानित समय',
      'btn_terminate_preemption': 'नियंत्रण समाप्त करें',
      'badge_atsc_wave': 'एटीएससी प्राथमिकता वेव प्रोटोकॉल',
      'label_origin_facility': 'प्रस्थान जंक्शन / सुविधा',
      'label_dest_corridor': 'गंतव्य कॉरिडोर जंक्शन',
      'label_priority_class': 'आपातकालीन प्राथमिकता वर्ग',
      'label_callsign_plate': 'वाहन कॉल साइन / नंबर प्लेट',
      'gw_auto_coord_hint': 'कॉरिडोर नोड्स पर स्वचालित रूप से सिग्नल चक्र ऑफसेट समन्वयित करता है',
      'badge_corridor_telemetry': '४ कॉरिडोर लाइव टेलीमेट्री',
      'corridor_jm_title': 'जेएम रोड आर्टेरियल कॉरिडोर',
      'badge_optimal_flow': 'इष्टतम प्रवाह',
      'corridor_jm_sub': 'छत्रपती संभाजीनगर ते डेक्कन जिमखाना (३.८ किमी · ६ एटीएससी नोड्स)',
      'metric_avg_speed': 'औसत गति',
      'metric_pcu_density': 'पीसीयू घनत्व',
      'metric_queue_time': 'कतार समय',
      'btn_optimize_cycle': 'चक्र अनुकूलित करें',
      'btn_flush_queue': 'कतार खाली करें',
      'corridor_fc_title': 'एफसी रोड वाणिज्यिक क्षेत्र',
      'badge_moderate_congestion': 'मध्यम यातायात जाम',
      'corridor_fc_sub': 'गुडलक चौक ते कृषी महाविद्यालय (२.९ किमी · ५ एटीएससी नोड्स)',
      'btn_extend_green': 'हरा बढ़ाएँ +२५ से',
      'btn_vms_diversion': 'वीएमएस डायवर्जन',
      'corridor_swargate_title': 'स्वारगेट मल्टी-मॉडल इंटरचेंज',
      'badge_heavy_congestion': 'भारी यातायात जाम',
      'corridor_swargate_sub': 'शिवाजी रोड × सातारा रोड ट्रांजिट हब (४.२ किमी · ८ एटीएससी नोड्स)',
      'btn_auto_clearance': 'स्वचालित निकासी',
      'btn_dispatch_tow': 'टो क्रेन भेजें',
      'corridor_airport_title': 'एयरपोर्ट ट्रांजिट एक्सप्रेसवे',
      'badge_free_flow': 'मुक्त प्रवाह',
      'corridor_airport_sub': 'एयरपोर्ट ५०९ चौक ते विमान नगर (७.१ किमी · ४ एटीएससी नोड्स)',
      'btn_check_radar': 'गति रडार जांचें',
      'btn_progression_banding': 'प्रोग्रेशन बैंडिंग',
      'kpi_total_iot': 'कुल आईओटी उपकरण',
      'kpi_field_nodes': 'फ़ील्ड कनेक्टेड नोड्स',
      'kpi_atsc_controllers': 'जंक्शन एटीएससी नियंत्रक',
      'kpi_online_heartbeat': '१००% ऑनलाइन सिग्नल',
      'kpi_anpr_nodes': 'एएनपीआर ४के ऑप्टिकल नोड्स',
      'kpi_nvdec_edge': 'एनवीडीईसी एज जीपीयू एआई सक्रिय',
      'kpi_speed_traps': 'रडार गति ट्रैप',
      'kpi_laser_calibrated': 'लेज़र कैलिब्रेटेड',
      'kpi_vms_signs': 'परिवर्तनीय संदेश बोर्ड (VMS)',
      'kpi_led_matrix': 'एलईडी मैट्रिक्स चालू',
      'placeholder_filter_asset': 'उपकरण टैग, आईपी या मॉडल फ़िल्टर करें...',
      'opt_all_hw_cats': 'सभी हार्डवेयर श्रेणियां',
      'opt_hw_atsc': 'जंक्शन एटीएससी नियंत्रक',
      'opt_hw_anpr': 'एज एएनपीआर कैमरे',
      'opt_hw_radar': 'लेज़र गति सेंसर',
      'opt_hw_vms': 'एलईडी परिवर्तनीय संदेश बोर्ड',
      'opt_hw_ecb': 'आपातकालीन कॉल बॉक्स',
      'btn_refresh_diagnostics': 'निदान पुनः ताज़ा करें',
      'kpi_watch_commander': 'सक्रिय ड्यूटी कमांडर',
      'kpi_watch_commander_sub': 'बैज #MH-PN-४४०२ (कंसोल ०३)',
      'kpi_officers_shift': 'ड्यूटी पर अधिकारी',
      'kpi_shift_hours': 'दिन की शिफ्ट (०८:०० - १६:०० भा.मा.वे.)',
      'kpi_sector_units': 'फील्ड सेक्टर इकाइयाँ',
      'kpi_sector_units_sub': 'पीसीआर + मोटरसाइकिल इंटरसेप्टर',
      'kpi_tactical_radio': 'रणनीतिक रेडियो नेटवर्क',
      'kpi_tactical_radio_sub': 'सभी ४ चैनल एन्क्रिप्टेड एवं सिंक',
      'placeholder_filter_staff': 'अधिकारी का नाम, बैज या रेडियो चैनल फ़िल्टर करें...',
      'opt_all_duty_statuses': 'सभी ड्यूटी स्थितियाँ',
      'opt_status_on_duty': 'ड्यूटी पर',
      'opt_status_on_patrol': 'फील्ड गश्त',
      'opt_status_dispatched': 'तैनात किया गया',
      'opt_status_standby': 'स्टैंडबाय',
      'btn_broadcast_tactical': 'रणनीतिक चेतावनी प्रसारित करें',
      'logs_daemon_stream': 'vims-iccc-daemon.service — लाइव जर्नल लॉग स्ट्रीम',
      'btn_clear_logs': 'लॉग हटाएं',
      'command_unit_subtitle': 'पुणे शहर पुलिस — यातायात शाखा एवं केंद्रीय निगरानी डेस्क',
      'lbl_vahan_queries': 'वाहन रजिस्ट्री खोज',
      'lbl_stolen_bulletins': 'चोरी हुए वाहन बुलेटिन',
      'lbl_watchlist_hits': 'सक्रिय निगरानी सूची मिलान',
      'lbl_cameras_online': 'ऑनलाइन जंक्शन कैमरे',
      'card_quick_controls': 'त्वरित नियंत्रण',
      'btn_goto_lookup': 'वाहन रजिस्ट्री खोजें',
      'btn_goto_ingest': 'सीसीटीवी फुटेज दर्ज करें',
      'btn_goto_watchlist': 'सक्रिय निगरानी सूची',
      'card_priority_alerts': 'हालिया प्राथमिकता अलर्ट',
      'badge_live_feed': 'लाइव फ़ीड',
      'card_atsc_telemetry': 'लाइव जंक्शन टेलीमेट्री: एटीएससी नोड-०१',
      'lbl_phase_status': 'वर्तमान सिग्नल चरण',
      'lbl_phase_elapsed': 'बीता हुआ चरण समय',
      'lbl_min_green_remain': 'न्यूनतम हरा शेष',
      'lbl_signal_cycle': 'सिग्नल चक्र',
      'corridor_ns_name': 'उत्तर–दक्षिण कॉरिडोर',
      'corridor_ew_name': 'पूर्व–पश्चिम कॉरिडोर',
      'lbl_pcu_demand': 'पीसीयू मांग',
      'card_camera_feed': 'जंक्शन कैमरा फ़ीड एवं यातायात विनियमन इनपुट',
      'badge_predownloaded': 'सिम्युलेटेड फ़ीड',
      'badge_adaptive_atsc': 'अनुकूली एटीएससी',
    }
  },

  _lastToggleTime: 0,
  _isApplying: false,
  _initialized: false,

  /**
   * Initialize language preferences
   */
  init() {
    if (this._initialized) {
      this.apply();
      return;
    }
    this._initialized = true;

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) || sessionStorage.getItem(this.STORAGE_KEY);
      if (saved && (saved === 'en' || saved === 'hi')) {
        this.CURRENT_LANG = saved;
      }
    } catch {
      this.CURRENT_LANG = 'en';
    }
    this.bindToggleButton();
    this.apply();
    this._observeDynamicContent();
  },

  /**
   * Robust idempotent binding for translation button with global delegation
   */
  bindToggleButton() {
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        this.toggleLanguage();
      };
    }
  },

  /**
   * Convert numbers between Western Arabic (0-9) and Devanagari numerals (०-९)
   */
  toLocalizedDigits(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    if (this.CURRENT_LANG === 'hi') {
      return str.replace(/[0-9]/g, d => devanagariDigits[parseInt(d, 10)]);
    } else {
      return str.replace(/[०-९]/g, d => {
        const idx = devanagariDigits.indexOf(d);
        return idx >= 0 ? idx.toString() : d;
      });
    }
  },

  /**
   * Automatically walk DOM text nodes and localize all numbers between Western (0-9) and Devanagari (०-९)
   */
  localizeDOMNumbers(root) {
    if (!root || typeof document === 'undefined') return;
    try {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
            if (tag === 'INPUT' || tag === 'TEXTAREA') {
              return NodeFilter.FILTER_REJECT;
            }
            if (parent.closest && parent.closest('[data-no-i18n-digits]')) {
              return NodeFilter.FILTER_REJECT;
            }
            if (/[0-9०-९]/.test(node.nodeValue)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      const nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].nodeValue = this.toLocalizedDigits(nodes[i].nodeValue);
      }
    } catch {}
  },

  /**
   * Get localized string by key
   */
  t(key, fallback = '') {
    const langDict = this.DICTIONARY[this.CURRENT_LANG] || this.DICTIONARY['en'];
    let val = langDict[key] || fallback || key;
    if (this.CURRENT_LANG === 'hi' && typeof val === 'string') {
      val = this.toLocalizedDigits(val);
    }
    return val;
  },

  /**
   * Toggle between English and Hindi with responsive execution and reactive broadcast
   */
  toggleLanguage() {
    const now = Date.now();
    if (now - this._lastToggleTime < 100) return; // Light debounce
    this._lastToggleTime = now;

    this.CURRENT_LANG = this.CURRENT_LANG === 'en' ? 'hi' : 'en';
    try {
      localStorage.setItem(this.STORAGE_KEY, this.CURRENT_LANG);
      sessionStorage.setItem(this.STORAGE_KEY, this.CURRENT_LANG);
    } catch {}

    this.apply();

    // Broadcast change so dynamic controllers can react immediately
    try {
      window.dispatchEvent(new CustomEvent('vims-lang-changed', {
        detail: { lang: this.CURRENT_LANG }
      }));
    } catch {}
  },

  /**
   * Apply translations to ALL elements with data-i18n, data-i18n-placeholder, data-i18n-btn attributes,
   * and convert all numbers in the DOM to/from Devanagari numerals
   */
  apply(root = document) {
    if (this._isApplying) return;
    this._isApplying = true;

    try {
      // 1. Standard text content translation via data-i18n
      const elements = root.querySelectorAll('[data-i18n]');
      elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        let translation = this.t(key);
        if (translation && translation !== key) {
          if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
            el.value = translation;
          } else {
            const svgEl = el.querySelector('svg');
            if (svgEl) {
              // Preserve child SVG icon
              const clonedSvg = svgEl.cloneNode(true);
              el.innerHTML = '';
              el.appendChild(clonedSvg);
              el.appendChild(document.createTextNode(' ' + translation));
            } else if (translation.includes('\n')) {
              el.innerHTML = translation.replace(/\n/g, '<br>');
            } else {
              el.textContent = translation;
            }
          }
        }
      });

      // 2. Placeholder translation via data-i18n-placeholder
      const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
      placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translation = this.t(key);
        if (translation && translation !== key) {
          el.placeholder = translation;
        }
      });

      // 3. Button text via data-i18n-btn
      const btns = root.querySelectorAll('[data-i18n-btn]');
      btns.forEach(el => {
        // Skip toggle button itself to prevent label collisions
        if (el.id === 'langToggle') return;
        const key = el.getAttribute('data-i18n-btn');
        const translation = this.t(key);
        if (translation && translation !== key) {
          el.textContent = translation;
        }
      });

      // 4. Title / Tooltip translation via data-i18n-title
      const titledEls = root.querySelectorAll('[data-i18n-title]');
      titledEls.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translation = this.t(key);
        if (translation && translation !== key) {
          el.title = translation;
        }
      });

      // 5. Localize all numbers across the entire document text nodes
      const numTarget = (root === document || root === document.documentElement) ? (document.body || document.documentElement) : root;
      this.localizeDOMNumbers(numTarget);

      // 6. Update all lang toggle buttons across the page (ensuring pure white text permanently)
      const toggleBtns = document.querySelectorAll('#langToggle, .sys-lang-toggle');
      toggleBtns.forEach(btn => {
        btn.textContent = this.CURRENT_LANG === 'en' ? 'EN | हि' : 'हि | EN';
        btn.title = this.CURRENT_LANG === 'en' ? 'हिन्दी में बदलें (Switch to Hindi)' : 'Switch to English';
        btn.style.color = '#ffffff';
        btn.style.fontWeight = '700';
      });

      // 7. Update HTML lang attribute
      if (document.documentElement) {
        document.documentElement.lang = this.CURRENT_LANG === 'hi' ? 'hi' : 'en';
      }
    } finally {
      this._isApplying = false;
    }
  },

  /**
   * Observe DOM for dynamically added content and auto-translate safely
   */
  _observeDynamicContent() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;

    const observer = new MutationObserver((mutations) => {
      if (this._isApplying) return;

      let needsTranslation = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.hasAttribute && node.hasAttribute('data-i18n')) {
                needsTranslation = true;
                break;
              }
              if (node.querySelector && node.querySelector('[data-i18n], [data-i18n-placeholder]')) {
                needsTranslation = true;
                break;
              }
            }
          }
        }
        if (needsTranslation) break;
      }
      if (needsTranslation) {
        this.apply();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
};

// Global Delegated Click Listener: Guarantees the translation button ALWAYS responds
document.addEventListener('click', (e) => {
  const target = e.target;
  const toggleBtn = target.closest ? target.closest('#langToggle, .sys-lang-toggle') : null;
  if (toggleBtn) {
    e.preventDefault();
    e.stopPropagation();
    I18N.toggleLanguage();
  }
});

// Auto-initialize as soon as DOM is ready without external gating
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => I18N.init());
  } else {
    I18N.init();
  }
}
