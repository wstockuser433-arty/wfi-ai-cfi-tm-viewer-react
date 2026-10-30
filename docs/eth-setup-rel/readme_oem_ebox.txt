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

./send_ebox_serial.sh -p /tmp/ttyV0 -n 0 -i 0.1 -y /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend/app/tm_dictionary/ebox.yaml -v


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