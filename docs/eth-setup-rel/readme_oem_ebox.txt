cd /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/docs/eth-setup-rel

chmod +x send_ebox_tm.sh

# one pass through the file, local
./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -v

# loop the file forever
./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -n 0

# another PC: only the host changes
./send_ebox_tm.sh -H <OTHER_PC_IP> -f ebox_payloads.txt -n 0


./send_ebox_tm-limits-wali.sh -H 127.0.0.1 -y /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend/app/tm_dictionary/ebox.yaml -n 0 -v


./send_ebox_serial.sh -p /tmp/ttyV0 -n 5 -v


# UDP, forever, one packet every second, all cards
./send_ebox_tm.sh -H 127.0.0.1 -n 0

# Serial, forever, one packet every 100 ms (10 Hz effective rate)
./send_ebox_serial.sh -p /tmp/ttyV0 -n 0 -i 0.1

# Serial, forever, only CAM_ELEC, verbose
./send_ebox_serial.sh -p /tmp/ttyV0 -c CAM_ELEC -n 0 -v

./send_ebox_serial.sh -p /tmp/ttyV0 -n 0 -i 1 -y /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend/app/tm_dictionary/ebox.yaml -v


./send_ebox_serial.sh -p /tmp/ttyV0 -y /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend/app/tm_dictionary/ebox.yaml -n 5 -v

./send_ebox_serial.sh \
  -p /tmp/ttyV0 \
  -y /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend/app/tm_dictionary/ebox.yaml \
  -c CAMERA_UNIT_STATUS \
  -n 5 -v

SENDER_TRANSPORT=udp ./start-tm-viewer.sh
SENDER_TRANSPORT=serial ./start-tm-viewer.sh
SENDER_TRANSPORT=none ./start-tm-viewer.sh    # backend-only, no fake traffic

# Frontend error check
cd frontend
npx tsc --noEmit

docker compose up -d postgres redis grafana

(correct one)
main hdr     6
+ sub hdr    1
+ eff hdr    4
+ payload  238   (when you uncomment the last 6 fields)
+ checksum   1
─────────────
         250

(current one with six ebox yaml file entries commented out)
payload           = 237 B
sub-header        =   1 B   (byte 0x01)
effective header  =   4 B   (0x1A, 0x10, 0x68, 0x01)
─────────────────────────
body              = 242 B
+ main header     =   6 B   (word0, word1, word2)
─────────────────────────
inner CCSDS packet = 248 B   (main hdr + sub-hdr + eff hdr + payload)
+ checksum        =   1 B
─────────────────────────
inner w/ checksum = 249 B
+ outer header    =   4 B
+ outer trailer   =   4 B
─────────────────────────
total wire frame  = 257 B


sudo tee /etc/systemd/system/ebox-pty.service <<'EOF'
[Unit]
Description=WFI-AI-CFI EBOX virtual serial PTY pair
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 \
                              pty,raw,echo=0,link=/tmp/ttyV1
Restart=always
RestartSec=2
User=%i

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ebox-pty.service
sudo systemctl status ebox-pty.service

