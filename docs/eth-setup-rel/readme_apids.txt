Fixed and verified: 36 packets, one datagram each, 18 APIDs, per-APID sequence counters, CRC and length correct. Delivering the script.

The updated `send_pus_tm.sh` now sends a continuous stream across all 18 APIDs, each with its own counters, and shows APID names in its output. I tested it against a local listener with all 18 APIDs over two rounds: all 36 packets arrived with valid CRC and length, and each APID's sequence count ran 0, 1.

**One bug fixed:** my first version split a packet into two UDP datagrams whenever it contained the byte `0x0A`. That affected every packet with an APID of `0x200` or higher, and any packet whose time or CRC bytes happened to match. Each packet is now written as a single datagram, so please replace the earlier copy.

**What changed:**
- **`-a` now takes `all` (the default), a list, or names.** Each entry can be hex, decimal or an APID name, and you can mix them:
  ```bash
  ./send_pus_tm.sh -H <PC2_IP> -v                                  # all 18 APIDs
  ./send_pus_tm.sh -H <PC2_IP> -a CDPM_P_FPGA,0x206,336 -n 0 -i 0.5
  ```
- **Counters are kept per APID.** Each APID has its own sequence count and its own message counter, so every APID's stream counts 0, 1, 2 and so on, as a real source would.
- **`-n` now counts rounds, not packets.** A round sends one packet for every selected APID. `-i` is the pause between rounds, and the new `-g` is the pause between packets inside a round.
- **`-l` lists your APID table**, and `-v` prints the name next to each packet, for example `APID 0x110 (272) CDPM_P_FPGA seq=0 ...`.
- **Bad APIDs are rejected.** Anything unknown or above 2047 stops with an error.

On PC2, the first two bytes of each packet show the APID: `0x110` appears as `0910`, and `0x206` appears as `0A06`.

