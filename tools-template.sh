LANG=en_US.UTF-8

# backup current files in demo project
if [ -f /data/gits/cert-demo/certificate_templates/test.json ]; then
        now=`date +%Y%m%d-%H%M%S`
        backup_name=/data/gits/cert-demo/history/certificate_templates/$now-test.json
        mv -f /data/gits/cert-demo/certificate_templates/test.json $backup_name
fi

# clear old files from project
rm -rf /data/gits/cert-tools/sample_data/certificate_templates/test.json

# generate new files
cd /data/gits/cert-tools
/usr/local/bin/create-certificate-template -c conf.ini

# copy new files to demo project so the web can see them
if [ -f /data/gits/cert-tools/sample_data/certificate_templates/test.json ]; then
        cp /data/gits/cert-tools/sample_data/certificate_templates/test.json /data/gits/cert-demo/certificate_templates/test.json
fi