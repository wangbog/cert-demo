LANG=en_US.UTF-8

# backup current files in demo project
mv -f /data/gits/cert-demo/unsigned_certificates/* /data/gits/cert-demo/history/unsigned_certificates/

# clear old files from project
rm -rf /data/gits/cert-tools/sample_data/unsigned_certificates/*

# generate new files
cd /data/gits/cert-tools
/usr/local/bin/instantiate-certificate-batch -c conf.ini

# copy new files to demo project so the web can see them
cp /data/gits/cert-tools/sample_data/unsigned_certificates/* /data/gits/cert-demo/unsigned_certificates/
