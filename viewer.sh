ps -ef | grep run.py | grep -v grep | awk '{print $2}' | xargs kill -9
cd /data/gits/cert-viewer
nohup python3 run.py -c conf_local.ini &
