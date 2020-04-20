<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge;chrome=1">
    <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black"/>
    <meta name="format-detection" content="telephone=no"/>
    <script src="myjs.js"></script>
    <link href="resource/css/base.css" rel="stylesheet" type="text/css">
    <link href="resource/css/index.css" rel="stylesheet" type="text/css">
    <link href="resource/css/inner.css" rel="stylesheet" type="text/css">
</head>
<body>

<div class="main-body">
    <div class="content">
        <div class="col_lg_10  top"></div>
        <div class="col_lg_10  col_md_10">
            <div class="mainContent">
                <div class="article">
                    <table class="no-border-table">
                        <tr>
                            <td style="height:40px; line-height:40px;">
                                <span class="category">Blockcerts区块链证书演示系统</span>
                            </td>
                        </tr>
                    </table>

                    <p>本系统基于<a href="https://www.blockcerts.org/" target="_blank"
                               style="color:8f000b;text-decoration:underline;">Blockcerts</a>方案，在比特币testnet区块链网络上发布数字学位证书。本地部署了一个bitcoin
                        core服务（bitcoind）用于同步账本及广播交易。<br>目前使用的比特币testnet发布地址为<a
                                href="https://live.blockcypher.com/btc-testnet/address/n3RzaNTD8LnBGkREBjSkouy5gmd2dVf7jQ/"
                                target="_blank" style="color:8f000b;text-decoration:underline;">n3RzaNTD8LnBGkREBjSkouy5gmd2dVf7jQ</a>，您可以自行根据说明发布属于您自己的证书，但使用时请注意该账户的余额，发布证书实质是通过比特币交易完成的，每次须扣除比特币交易要求的手续费，因此请尽量避免过度浪费。<br>另外请注意，比特币testnet网络为测试网络，通常在其上的交易（发布的证书是依托于交易的）是不被认为有价值的，因此请不要太当真~
                    </p>
                    <br>
                    <p><a class="pku-red" href="demo_video.html" target="_blank"><span style="font-size:14px;">点击此处查看DEMO视频</span></a>
                    </p>

                    <p><img style="width:100%;" src="./resource/image/issuing_process.png" alt="发布证书的流程"/></p>

                    <form method="GET" action="">
                        <p>
                            <text id="main_text" value="初始化中......"></text>
                        </p>
                        <div id="div_main1" style="display: none;">
                            <p><br/></p>
                            <table class="no-border-table">
                                <tr>
                                    <td style="height:40px; line-height:40px;">
                                        <span class="category">第1步：根据配置文件生成证书模板</span>
                                    </td>
                                </tr>
                            </table>
                            <p>证书是在Open
                                Badges规范的基础上进行了一定的修改而来的。证书是JSON-LD格式的，是一种跨平台统一的JSON格式，保证同一份证书内容在所有平台下hash的值一致（比如属性的顺序、文本缩进、换行符等在不同平台表现不一样），具体格式参见：<a
                                        href="https://github.com/blockchain-certificates/cert-schema" target="_blank"
                                        style="color:8f000b;text-decoration:underline;">cert-schema</a></p>

                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <a class="btn" type="submit" id="btn_template"
                                           onclick="doTemplate(); return false">生成模板</a>
                                        <a class="pku-red" id="config_template" style="display:"
                                           href="http://115.27.243.20/cert-demo/conf_tools.ini"
                                           target="_blank">查看配置文件</a>
                                        <a class="pku-red" id="file_template" style="display:none"
                                           href="http://115.27.243.20/cert-demo/certificate_templates/test.json"
                                           target="_blank">模板文件</a>
                                    </td>
                                </tr>
                            </table>
                            <textarea id="ta_template" readonly="readonly"
                                      style="width:100%;height:50px;overflow:auto;"></textarea>
                            <table class="no-border-table">
                                <tr>
                                    <td class="split">
                                        <hr class="pku-grey-hr"/>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td style="height:40px; line-height:40px;">
                                        <span class="category">第2步：准备证书被授予人名册（列表）</span>
                                    </td>
                                </tr>
                            </table>
                            <p>
                                证书被授予人名册（列表）是一个csv文件，须为每位被授予人提供name（姓名）、pubkey（被授予人的公开key，对应的私有key保存在该被授予人手中）、identity（比如邮箱）三个信息。为便于演示，请将csv文件内容（用纯文本编辑器打开、复制）贴在下面的文本框中。可以参考这份<a
                                        href="http://115.27.243.20/cert-demo/sample_roster_testnet.csv" target="_blank"
                                        style="color:8f000b;text-decoration:underline;">示例csv文件</a></p>
                            <textarea id="ta_roster" style="width:100%;height:100px;overflow:auto;">name,pubkey,identity
Zhang San,ecdsa-koblitz-pubkey:mtr98kany9G1XYNU74pRnfBQmaCg2FZLmc,eularia@landroth.org
Wang Bo,ecdsa-koblitz-pubkey:ms4dAM8PcSeYtyLGGN3JUF5pbtHHmBaM6i,wb626@pku.edu.cn</textarea>
                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <a class="btn" type="submit" id="btn_roster" onclick="doRoster(); return false"
                                           disabled="true">保存名册</a>
                                        <a class="pku-red" id="file_roster" style="display:none"
                                           href="http://115.27.243.20/cert-demo/roster_testnet.csv" target="_blank">已保存的名册</a>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td class="split">
                                        <hr class="pku-grey-hr"/>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td style="height:40px; line-height:40px;">
                                        <span class="category">第3步：根据配置文件及模板生成证书</span>
                                    </td>
                                </tr>
                            </table>
                            <p>基于上一步生成的证书模板，为所有证书被授予人印制证书，即将被授予人的信息填入模板空白处。注意此步生成的证书是还未签名的证书。</p>
                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <a class="btn" type="submit" id="btn_certificate"
                                           onclick="doCertificate(); return false" disabled="true">生成证书</a>
                                        <a class="pku-red" id="config_certificate" style="display:"
                                           href="http://115.27.243.20/cert-demo/conf_tools.ini"
                                           target="_blank">查看配置文件</a>
                                        <a class="pku-red" id="file_certificate" style="display:none"
                                           href="http://115.27.243.20/cert-demo/unsigned_certificates/" target="_blank">未签名证书文件</a>
                                    </td>
                                </tr>
                            </table>
                            <textarea id="ta_certificate" readonly="readonly"
                                      style="width:100%;height:50px;overflow:auto;"></textarea>
                            <table class="no-border-table">
                                <tr>
                                    <td class="split">
                                        <hr class="pku-grey-hr"/>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td style="height:40px; line-height:40px;">
                                        <span class="category">第4步：将证书发布到区块链上</span>
                                    </td>
                                </tr>
                            </table>
                            <p>将证书发布到比特币testnet区块链上：使用issuer的比特币地址，发起一笔向自己的转账交易，支付一定的交易费用（激励矿工）。OP_RETURN
                                字段，存了证书Merkle树的hash</p>

                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <a class="btn" type="submit" id="btn_issuer" onclick="doIssuer(); return false"
                                           disabled="true">证书上链</a>
                                        <a class="pku-red" id="config_issuer" style="display:;"
                                           href="http://115.27.243.20/cert-demo/conf_issuer.ini"
                                           target="_blank">查看配置文件</a>
                                        <a class="pku-red" id="file_issuer" style="display:none;"
                                           href="http://115.27.243.20/cert-demo/blockchain_certificates/"
                                           target="_blank">已上链证书文件</a>
                                    </td>
                                </tr>
                            </table>
                            <textarea id="ta_issuer" readonly="readonly"
                                      style="width:100%;height:200px;overflow:auto;"></textarea>
                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <div id="div_issuer_tx" style="display: none"><a class="pku-red"
                                                                                         id="issuer_tx_verify" href=""
                                                                                         target="_blank">验证交易</a></div>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td class="split">
                                        <hr class="pku-grey-hr"/>
                                    </td>
                                </tr>
                            </table>
                            <table class="no-border-table">
                                <tr>
                                    <td style="height:40px; line-height:40px;">
                                        <span class="category">第5步：在线验证证书</span>
                                    </td>
                                </tr>
                            </table>
                            <p><a class="pku-red" href="https://www.blockcerts.org/" target="_blank">1. Blockcerts官网</a>
                                （出于安全考虑，本DEMO网站未配置公网https域名，因此Blockcerts无法通过URL获取证书文件，只能通过证书JSON文件验证。或者您也可以将证书JSON文件部署在您自己的公网服务器上。比较简单的做法也可以直接部署到github pages上。）</p>

                            <table class="no-border-table" style="padding:0px;margin:0 auto;">
                                <tr>
                                    <td>
                                        <a class="pku-red" href="http://115.27.243.20:5000/" target="_blank">2.
                                            本校cert-viewer网站验证</a>（使用官方开源的cert-viewer，展现效果较差，功能还不完善）
                                    </td>
                                </tr>
                            </table>

                            <p>3. 手机应用商店搜索“Blockcerts Wallet”，导入证书</p>
                        </div>
                    </form>
                    <p><br/></p>
                    <p><br/></p>
                    <p>欢迎联系交流：北京大学计算中心 王博 wb626@pku.edu.cn</p>
                </div>
            </div>
        </div>
    </div>
</div>
<footer class="footer">
    <section class="fot_bot">
        <span class="copyright">版权所有©北京大学</span>
        <span class="addr">地址：北京市海淀区颐和园路5号</span>
        <span class="postcode">邮编：100871</span>
        <span class="email">邮箱：its@pku.edu.cn</span>
        <span class="telephone">电话：010-62751023</span>
        <span class="tech-sup">支持：<a href="http://cc.pku.edu.cn">北京大学计算中心</a></span>
    </section>
</footer>
</body>
</html>
