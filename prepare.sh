LANG=en_US.UTF-8

# copy config files to demo project so the web can see them
cp /data/gits/cert-tools/conf.ini /data/gits/cert-demo/conf_tools.ini
cp /data/gits/cert-issuer/conf.ini /data/gits/cert-demo/conf_issuer.ini
cp /data/gits/cert-viewer/conf_local.ini /data/gits/cert-demo/conf_viewer.ini
cp /data/gits/cert-tools/sample_data/rosters/roster_testnet.csv /data/gits/cert-demo/sample_roster_testnet.csv

echo 'done'
