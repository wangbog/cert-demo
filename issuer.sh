LANG=en_US.UTF-8

# backup current files in demo project
mv -f /data/gits/cert-demo/blockchain_certificates/* /data/gits/cert-demo/history/blockchain_certificates/

# clear old files from project
rm -rf /etc/cert-issuer/data/unsigned_certificates/*
rm -rf /etc/cert-issuer/data/blockchain_certificates/*

# copy unsigned certificates from tools folder to production folder
cp /data/gits/cert-tools/sample_data/unsigned_certificates/* /etc/cert-issuer/data/unsigned_certificates/

# generate new files
cd /data/gits/cert-issuer
/usr/local/bin/cert-issuer -c conf.ini

# copy new files to demo project so the web can see them
cp /etc/cert-issuer/data/blockchain_certificates/* /data/gits/cert-demo/blockchain_certificates/
