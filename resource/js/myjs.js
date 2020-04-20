window.onload = function () {
    if (window.XMLHttpRequest) {
        // IE7+, Firefox, Chrome, Opera, Safari 浏览器执行的代码
        xmlhttp = new XMLHttpRequest();
    } else {
        //IE6, IE5 浏览器执行的代码
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            document.getElementById("main_text").value = ""
            document.getElementById("div_main1").style.display = ""
        }
    }
    xmlhttp.open("GET", "api.php?prepare", true);
    xmlhttp.send();
}

function doTemplate() {
    document.getElementById("btn_template").disabled = true
    document.getElementById("ta_template").value = '处理中，请耐心等待......'
    if (window.XMLHttpRequest) {
        // IE7+, Firefox, Chrome, Opera, Safari 浏览器执行的代码
        xmlhttp = new XMLHttpRequest();
    } else {
        //IE6, IE5 浏览器执行的代码
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            document.getElementById("btn_template").disabled = false
            document.getElementById("ta_template").value = xmlhttp.responseText
            document.getElementById("file_template").style.display = ""
            document.getElementById("btn_roster").disabled = false
        }
    }
    xmlhttp.open("GET", "api.php?template", true);
    xmlhttp.send();
}

function doRoster() {
    str = document.getElementById("ta_roster").value

    document.getElementById("btn_roster").disabled = true
    document.getElementById("ta_roster").value = '处理中，请耐心等待（这一步可能需要30s以上的时间）......'
    if (window.XMLHttpRequest) {
        // IE7+, Firefox, Chrome, Opera, Safari 浏览器执行的代码
        xmlhttp = new XMLHttpRequest();
    } else {
        //IE6, IE5 浏览器执行的代码
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            document.getElementById("btn_roster").disabled = false
            document.getElementById("ta_roster").value = xmlhttp.responseText
            document.getElementById("file_roster").style.display = ""
            document.getElementById("btn_certificate").disabled = false
        }
    }
    xmlhttp.open("POST", "api.php?roster", true);
    xmlhttp.setRequestHeader("Content-type","application/x-www-form-urlencoded");
    xmlhttp.send("csv=" + str);
}

function doCertificate() {
    document.getElementById("btn_certificate").disabled = true
    document.getElementById("ta_certificate").value = '处理中，请耐心等待（这一步可能需要30s以上的时间）......'
    if (window.XMLHttpRequest) {
        // IE7+, Firefox, Chrome, Opera, Safari 浏览器执行的代码
        xmlhttp = new XMLHttpRequest();
    } else {
        //IE6, IE5 浏览器执行的代码
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            document.getElementById("btn_certificate").disabled = false
            document.getElementById("ta_certificate").value = xmlhttp.responseText
            document.getElementById("file_certificate").style.display = ""
            document.getElementById("btn_issuer").disabled = false
        }
    }
    xmlhttp.open("GET", "api.php?certificate", true);
    xmlhttp.send();
}

function doIssuer() {
    document.getElementById("btn_issuer").disabled = true
    document.getElementById("ta_issuer").value = '处理中，请耐心等待......'
    if (window.XMLHttpRequest) {
        // IE7+, Firefox, Chrome, Opera, Safari 浏览器执行的代码
        xmlhttp = new XMLHttpRequest();
    } else {
        //IE6, IE5 浏览器执行的代码
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var str = xmlhttp.responseText
            var json=JSON.parse(str)
            document.getElementById("btn_issuer").disabled = true
            document.getElementById("ta_issuer").value = json.lines
            document.getElementById("file_issuer").style.display = ""
            document.getElementById("div_issuer_tx").style.display = ""
            document.getElementById("issuer_tx_verify").href="https://live.blockcypher.com/btc-testnet/tx/" + json.tx
        }
    }
    xmlhttp.open("GET", "api.php?issuer", true);
    xmlhttp.send();
}