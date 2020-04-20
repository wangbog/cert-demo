<?php
if (isset($_GET['prepare'])) {
    $result = exec("sudo /bin/sh /data/gits/cert-demo/prepare.sh 2>&1", $info);
    echo getresult($info);
}
if (isset($_GET['template'])) {
    $result = exec("sudo /bin/sh /data/gits/cert-demo/tools-template.sh 2>&1", $info);
    echo getresult($info);
}
if (isset($_GET['roster'])) {
    $csv = htmlspecialchars($_POST['csv']);

    $myfile = fopen("roster_testnet.csv", "w") or die("Unable to open file!");
    fwrite($myfile, $csv);
    fclose($myfile);

    $result = exec("sudo /bin/sh /data/gits/cert-demo/roster.sh 2>&1", $info);
    echo $csv;
}
if (isset($_GET['certificate'])) {
    $result = exec("sudo /bin/sh /data/gits/cert-demo/tools-certificate.sh 2>&1", $info);
    echo getresult($info);
}
if (isset($_GET['issuer'])) {
    $result = exec("sudo /bin/sh /data/gits/cert-demo/issuer.sh 2>&1", $info);
    //$result2 = exec("sudo /bin/sh /data/gits/cert-demo/viewer.sh 2>&1", $info2);
    echo getresulttx($info);
}

function getresult($result)
{
    $str = "";
    foreach ($result as $line) {
        $str .= $line;
        $str .= "\r\n";
    }
    return $str;
}

function getresulttx($result)
{
    $str = "";
    foreach ($result as $line) {
        $str .= $line;
        $str .= "\r\n";

        $tmparray = explode("INFO - Broadcast transaction with txid ",$line);
        if(count($tmparray)>1){
            $tx = $tmparray[1];
        }
    }
    $ret  = array("lines" => $str, "tx" => $tx);
    return json_encode($ret);
}
?>
