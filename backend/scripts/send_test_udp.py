"""
Fires N CCSDS frames at a UDP endpoint. Useful for smoke-testing
UdpSource without spinning up the full simulator.
"""
import argparse
import asyncio
import socket
import struct
import time

from app.sim.spacecraft_model import SimState
from app.sim.packet_builder import build_all


async def main(host: str, port: int, count: int, rate_hz: float) -> None:
    addr = (host, port)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    state = SimState()
    interval = 1.0 / rate_hz

    for i in range(count):
        state.tick()
        for frame in build_all(state):
            sock.sendto(frame, addr)
        if i % 10 == 0:
            print(f"sent batch {i}/{count}")
        await asyncio.sleep(interval)

    sock.close()
    print("done")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=9200)
    p.add_argument("--count", type=int, default=100)
    p.add_argument("--rate", type=float, default=10.0)
    args = p.parse_args()
    asyncio.run(main(args.host, args.port, args.count, args.rate))