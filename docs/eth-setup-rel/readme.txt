chmod +x send_pus_tm.sh
./send_pus_tm.sh -H <PC2_IP> -v                      # 10 packets to port 9200, 1 s apart
./send_pus_tm.sh -H <PC2_IP> -n 0 -i 0.2 -s 5 -t 1   # run forever, 5 per second, service 5 subtype 1
