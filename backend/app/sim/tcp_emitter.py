import asyncio
import logging

from .spacecraft_model import SimState
from .packet_builder import build_all

log = logging.getLogger(__name__)


async def start_simulator(host: str, port: int, rate_hz: float = 10.0) -> None:
    await asyncio.sleep(1.0)  # let server come up
    state = SimState()

    while True:
        writer = None
        try:
            reader, writer = await asyncio.open_connection(host, port)
            log.info("Simulator connected to %s:%d", host, port)

            while True:
                state.tick()
                for frame in build_all(state):
                    writer.write(frame)
                await writer.drain()
                await asyncio.sleep(1.0 / rate_hz)

        except (ConnectionRefusedError, ConnectionResetError, BrokenPipeError, OSError) as e:
            log.warning("Simulator link lost (%s) — retrying in 2s", e)
            await asyncio.sleep(2.0)

        except asyncio.CancelledError:
            break

        except Exception:
            log.exception("Simulator crashed — retrying in 2s")
            await asyncio.sleep(2.0)

        finally:
            if writer is not None:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass