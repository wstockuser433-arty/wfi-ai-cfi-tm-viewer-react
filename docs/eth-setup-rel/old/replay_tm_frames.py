#!/usr/bin/env python3
"""
Replay tm_frames.txt → serial port (or UDP) endlessly.

  python3 replay_tm_frames.py tm_frames.txt -p /tmp/ttyV0
  python3 replay_tm_frames.py tm_frames.txt -p /tmp/ttyV0 --interval 0.5 --loop
  python3 replay_tm_frames.py tm_frames.txt --udp 127.0.0.1:9200 --interval 0.2 --loop
"""
import argparse, socket, sys, time
from pathlib import Path

def read_frames(path):
    frames = []
    for n, line in enumerate(Path(path).read_text().splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("#"): continue
        if not all(c in "0123456789abcdefABCDEF" for c in s) or len(s) % 2 != 0:
            sys.exit(f"{path}:{n}: invalid hex")
        frames.append(bytes.fromhex(s))
    if not frames: sys.exit(f"{path}: no frames found")
    return frames

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("-p", "--port", help="serial port (e.g. /tmp/ttyV0 or /dev/ttyUSB0)")
    ap.add_argument("--udp", help="host:port instead of serial (e.g. 127.0.0.1:9200)")
    ap.add_argument("-b", "--baud", type=int, default=115200)
    ap.add_argument("-i", "--interval", type=float, default=0.1,
                    help="seconds between frames (default 0.1)")
    ap.add_argument("--loop", action="store_true", help="loop forever")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not (args.port or args.udp):
        sys.exit("specify -p <serial> or --udp <host:port>")

    frames = read_frames(args.file)
    print(f"Loaded {len(frames)} frames from {args.file}")

    # open sink
    if args.udp:
        host, port = args.udp.rsplit(":", 1)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect((host, int(port)))
        def send(b): sock.send(b)
        print(f"Sending UDP → {args.udp} @ {1/args.interval:.1f} fps")
    else:
        import serial
        ser = serial.Serial(args.port, args.baud, timeout=0)
        def send(b): ser.write(b); ser.flush()
        print(f"Sending serial → {args.port} @ {args.baud} baud, {1/args.interval:.1f} fps")

    sent, pass_no = 0, 0
    try:
        while True:
            pass_no += 1
            for i, f in enumerate(frames, 1):
                send(f)
                sent += 1
                if args.verbose:
                    print(f"[{sent}] pass {pass_no} frame {i}/{len(frames)}  {len(f)} B")
                time.sleep(args.interval)
            if not args.loop:
                break
    except KeyboardInterrupt:
        print()
    finally:
        if not args.udp: ser.close()
    print(f"Sent {sent} frames in {pass_no} pass(es)")

if __name__ == "__main__":
    main()