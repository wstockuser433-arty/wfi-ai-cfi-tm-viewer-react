import struct
from dataclasses import dataclass
from ..ingestion.depacketizer import CCSDS_HEADER_LEN


@dataclass
class CcsdsHeader:
    cc: int
    apid: int
    seq_flags: int
    seq_count: int
    length: int


def parse_ccsds_header(raw: bytes) -> CcsdsHeader:
    cc, apid_seq, seq, length = struct.unpack(">BHHH", raw[:CCSDS_HEADER_LEN])
    return CcsdsHeader(
        cc=cc,
        apid=apid_seq & 0x7FF,
        seq_flags=(seq >> 14) & 0x3,
        seq_count=seq & 0x3FFF,
        length=length,
    )