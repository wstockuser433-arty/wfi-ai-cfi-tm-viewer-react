chmod +x send_ebox_tm.sh

# one pass through the file, local
./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -v

# loop the file forever
./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -n 0

# another PC: only the host changes
./send_ebox_tm.sh -H <OTHER_PC_IP> -f ebox_payloads.txt -n 0