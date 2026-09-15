"""
VIMS — Universal Indian Vehicle Plate Validator & Normalizer
Handles all standard, Bharat series, commercial/transport, and legacy/vintage formats.
"""

import re
from typing import Tuple, Optional, Dict

# 1. Standard Modern Format: e.g. MH12AB1234, DL4CAF4432
REGEX_STANDARD_MODERN = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")

# 2. Bharat Series: e.g. 22BH1234A, 22BH1234AB
REGEX_BHARAT_SERIES = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")

# 3. State Transport / Commercial: e.g. MH12Q1234
REGEX_COMMERCIAL_TRANSPORT = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{1}[0-9]{4}$")

# 4. Legacy / Vintage Format: e.g. MMU1234, BMU12, DDA1234, MRC123
REGEX_LEGACY_VINTAGE = re.compile(r"^[A-Z]{2,3}[0-9]{1,4}$")


def normalize_plate(raw_plate: str) -> str:
    """
    Strips all spaces, hyphens, and dots, converting to uppercase.
    """
    if not raw_plate or not isinstance(raw_plate, str):
        return ""
    return re.sub(r"[\s\-\.]+", "", raw_plate).upper()


def validate_indian_plate(raw_plate: str) -> Tuple[bool, str, Optional[str], Optional[str]]:
    """
    Validate and normalize an Indian vehicle registration plate against official formats.

    Returns:
        (is_valid: bool, normalized_plate: str, format_type: Optional[str], error: Optional[str])
    """
    normalized = normalize_plate(raw_plate)

    if not normalized:
        return False, "", None, "Vehicle registration plate number is required."

    if len(normalized) < 4 or len(normalized) > 12:
        return False, normalized, None, "Plate length must be between 4 and 12 alphanumeric characters."

    # Check 1: Standard Modern
    if REGEX_STANDARD_MODERN.match(normalized):
        return True, normalized, "STANDARD_MODERN", None

    # Check 2: Bharat Series
    if REGEX_BHARAT_SERIES.match(normalized):
        return True, normalized, "BHARAT_SERIES", None

    # Check 3: State Transport / Commercial
    if REGEX_COMMERCIAL_TRANSPORT.match(normalized):
        return True, normalized, "COMMERCIAL_TRANSPORT", None

    # Check 4: Legacy / Vintage
    if REGEX_LEGACY_VINTAGE.match(normalized):
        return True, normalized, "LEGACY_VINTAGE", None

    return False, normalized, None, "Invalid plate format. Must match Standard Modern (MH12AB1234), BH Series (22BH1234A), Commercial (MH12Q1234), or Legacy format."
