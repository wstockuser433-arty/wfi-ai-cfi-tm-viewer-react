"""
Maps decoder mode → primary-header length.

When you add an OEM decoder later, add its header length here.
"""

HEADER_LEN_BY_DECODER: dict[str, int] = {
    "custom": 7,   # legacy custom format: CC(1)+APID+SEQ(4)+LEN(2)
    "pus":    6,   # standard CCSDS primary header
    "ebox":   6,   # same CCSDS header length as PUS
    "oem":    6,   # placeholder — adjust once OEM format is defined
}


def header_len_for(decoder_name: str) -> int:
    return HEADER_LEN_BY_DECODER.get(decoder_name.lower(), 6)