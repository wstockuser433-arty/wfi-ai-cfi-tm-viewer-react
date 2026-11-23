->Terminal-1
conda activate scc
cd /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/
docker compose up -d postgres redis grafana
cd backend/
python run.py

->Terminal-2
conda activate scc
cd /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/frontend
npm run dev

->New commands
conda activate scc
cd /home/hassan/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/docs/eth-setup-rel

python3 generate_frames.py ../../backend/app/tm_dictionary tm_frames_1.txt 10

python3 replay_tm_frames.py tm_frames_1.txt -p /tmp/ttyV0 --interval 0.2


-Delete everything on Postgres
docker exec -it tm-postgres psql -U tm -d tmdb -c "TRUNCATE TABLE packets, parameters RESTART IDENTITY CASCADE;


Send everything

./send_ebox_serial.sh \
  -p /tmp/ttyV0 \
  -y ../../backend/app/tm_dictionary \
  -c all \
  -n 0 \
  -i 1 \
  -v



Via Serial 

Terminal 1 (Camera)
./send_ebox_serial.sh \
  -p /tmp/ttyV0 \
  -y ../../backend/app/tm_dictionary/camera_status.yaml \
  -c CAMERA_UNIT_STATUS,CAMERA_MOTION_CALC,CAMERA_MOTION_COEFF,CAMERA_TERRAIN_ELEV \
  -n 0 \
  -i 1 \
  -v

Terminal 2 (CTPU)
./send_ebox_serial.sh \
  -p /tmp/ttyV0 \
  -y ../../backend/app/tm_dictionary/ctpu.yaml \
  -c CTPU_TM \
  -n 0 \
  -i 1 \
  -v


Via Ethernet

Terminal 1 (Camera)
./send_ebox_tm-limits-wali.sh \
  -H 127.0.0.1 \
  -p 9200 \
  -y ../../backend/app/tm_dictionary/camera_status.yaml \
  -c CAMERA_UNIT_STATUS,CAMERA_MOTION_CALC,CAMERA_MOTION_COEFF,CAMERA_TERRAIN_ELEV \
  -n 0 \
  -i 1 \
  -v

Terminal 2 (CTPU)
./send_ebox_tm-limits-wali.sh \
  -H 127.0.0.1 \
  -p 9200 \
  -y ../../backend/app/tm_dictionary/ctpu.yaml \
  -c CTPU_TM \
  -n 0 \
  -i 1 \
  -v


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
+ payload  237  
+ checksum   1
─────────────
         249

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


(base) hassan@net-5842U-10:~/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend$ ls /dev/ttyUSB* /dev/ttyACM*
ls: cannot access '/dev/ttyUSB*': No such file or directory
ls: cannot access '/dev/ttyACM*': No such file or directory
(base) hassan@net-5842U-10:~/Documents/Hassan/scc-work/wfi-ai-cfi-tm-viewer-react-oem-packets/backend$ lsusb -t
/:  Bus 02.Port 1: Dev 1, Class=root_hub, Driver=xhci_hcd/9p, 20000M/x2
/:  Bus 01.Port 1: Dev 1, Class=root_hub, Driver=xhci_hcd/16p, 480M
    |__ Port 7: Dev 2, If 0, Class=Human Interface Device, Driver=usbhid, 1.5M
    |__ Port 7: Dev 2, If 1, Class=Human Interface Device, Driver=usbhid, 1.5M
    |__ Port 8: Dev 3, If 0, Class=Human Interface Device, Driver=usbhid, 1.5M



grep -rniE "(ICD|interface[[:space:]]+control[[:space:]]+document|§[[:space:]]*[0-9]|table[[:space:]]+[0-9]+|section[[:space:]]+[0-9]+)" \
  . \
  --exclude-dir={node_modules,.git,dist,build,venv,.venv,__pycache__,.pytest_cache,.mypy_cache,.ruff_cache} \
  --exclude={*.log,*.lock,package-lock.json,yarn.lock,pnpm-lock.yaml}


grep -rnE "(§|section|table)[[:space:]]*[45]\.[0-9]" \
  . \
  --exclude-dir={node_modules,.git,dist,build,venv,.venv,__pycache__} \
  --exclude={*.log,*.lock,package-lock.json}


find . \
  -type d \( -name node_modules -o -name .git -o -name venv -o -name .venv -o -name dist -o -name build \) -prune -o \
  -type f \( -iname "*icd*" -o -iname "*interface*control*" \) -print



docker_db_commands

Here are the commands to view your current data count, truncate the tables, and then monitor how new packets flow in.

### 1) Check how many packets are currently there
Run this to see the total count and the time range of your current data:

```bash
docker exec -it tm-postgres psql -U tm -d tmdb -c "
  SELECT 
    count(*) AS total_packets, 
    min(ts) AS oldest_packet, 
    max(ts) AS newest_packet 
  FROM packets;
"
```

*(Optional)* If you want to see the breakdown by subsystem to understand what's arriving:

```bash
docker exec -it tm-postgres psql -U tm -d tmdb -c "
  SELECT subsystem, count(*) 
  FROM packets 
  GROUP BY subsystem 
  ORDER BY count(*) DESC;
"
```

---

### 2) Delete all packets (and their associated decoded parameters)
Because your `ParameterRow` table has `ondelete="CASCADE"` pointing to `packets.id`, you only need to delete from `packets`. However, using `TRUNCATE` with `CASCADE` is the cleanest way to reset everything and reset the auto-incrementing IDs back to 1.

```bash
docker exec -it tm-postgres psql -U tm -d tmdb -c "TRUNCATE TABLE packets, parameters RESTART IDENTITY CASCADE;"
```

---

### 3) Monitor the arrival of new packets (time-wise)
Once you start your sender again, you can watch them arrive in real-time. 

**Option A: Watch the last 10 packets arrive (live feed)**
Run this, and every time a new packet is inserted, it will print to your terminal. It shows the timestamp and subsystem:
```bash
docker exec -it tm-postgres psql -U tm -d tmdb -c "SELECT ts, subsystem, card, seq FROM packets ORDER BY ts DESC LIMIT 10;"
```
*(You can run this command repeatedly to see the latest 10).*

**Option B: Count how many arrive per second**
If you want to see the rate of arrival (e.g., to check if they are arriving in bursts or evenly spaced), run this:
```bash
docker exec -it tm-postgres psql -U tm -d tmdb -c "
  SELECT 
    date_trunc('second', ts) AS arrival_second, 
    count(*) AS packets_in_that_second 
  FROM packets 
  GROUP BY arrival_second 
  ORDER BY arrival_second DESC 
  LIMIT 20;
"
```

**Option C: A continuous watch (Linux/Mac)**
If you want a live-updating dashboard in your terminal, run:
```bash
watch -n 1 "docker exec -it tm-postgres psql -U tm -d tmdb -c \"SELECT count(*) AS total, max(ts) AS latest_packet FROM packets;\""
```
This will refresh every second, showing the total count growing and the timestamp of the most recent packet.