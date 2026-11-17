/**
 * einvoice.js 逻辑回归测试
 *
 * XML 结构按 S3 真机读取的真实数电票（2026-08-02 开具，
 * 发票号码 26932000001295659876）1:1 还原，包含全部易踩坑路径。
 * 二维码样本来自 S1 真机扫码 2026-11-16。
 *
 *   node test/miniprogram/einvoice.test.js
 */

const e = require('../../miniprogram/utils/einvoice')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

/* ---------- 真实结构 XML（双明细，用来暴露「合计取错行」的 bug） ---------- */

const xml = `<?xml version="1.0" encoding="utf-8"?>
<EInvoice>
  <Header>
    <EIid>26932000001295659876</EIid>
    <Version>0.37</Version>
    <EInvoiceTag>SWEI3302</EInvoiceTag>
    <InherentLabel>
      <EInvoiceType><LabelCode>01</LabelCode><LabelName>电子发票</LabelName></EInvoiceType>
      <GeneralOrSpecialVAT><LabelCode>02</LabelCode><LabelName>普通发票</LabelName></GeneralOrSpecialVAT>
      <InIssuType><LabelCode>Y</LabelCode><LabelName>是否蓝字发票标志</LabelName></InIssuType>
      <TaxpayerType><LabelCode>1</LabelCode><LabelName>一般纳税人</LabelName></TaxpayerType>
    </InherentLabel>
    <UndefinedLabel>
      <Label><LabelCode>00</LabelCode><LabelName>无</LabelName><LabelType>0</LabelType></Label>
    </UndefinedLabel>
  </Header>
  <EInvoiceData>
    <SellerInformation>
      <SellerName>宁波顺渝餐饮管理有限公司</SellerName>
      <SellerIdNum>91330205MACB4PTU91</SellerIdNum>
      <SellerAddr>浙江省宁波市</SellerAddr>
      <SellerTelNum>0574-88888888</SellerTelNum>
      <SellerBankName>某某银行</SellerBankName>
      <SellerBankAccNum>1234567890</SellerBankAccNum>
    </SellerInformation>
    <BuyerInformation>
      <BuyerName>姚未正（个人）</BuyerName>
    </BuyerInformation>
    <BasicInformation>
      <RequestTime>2026-08-02 16:07:11</RequestTime>
      <Drawer>林素贞</Drawer>
      <TotalAmWithoutTax>138.68</TotalAmWithoutTax>
      <TotalTax-includedAmount>147.00</TotalTax-includedAmount>
      <TotalTax-includedAmountInChinese>壹佰肆拾柒圆整</TotalTax-includedAmountInChinese>
      <TotalTaxAm>8.32</TotalTaxAm>
    </BasicInformation>
    <IssuItemInformation>
      <ItemName>*生产生活服务*餐饮</ItemName>
      <TaxClassificationCode>3070401000000000000</TaxClassificationCode>
      <TaxRate>0.06</TaxRate>
      <Amount>94.34</Amount>
      <ComTaxAm>5.66</ComTaxAm>
      <TotaltaxIncludedAmount>100.00</TotaltaxIncludedAmount>
    </IssuItemInformation>
    <IssuItemInformation>
      <ItemName>*生产生活服务*餐饮服务</ItemName>
      <TaxClassificationCode>3070401000000000000</TaxClassificationCode>
      <TaxRate>0.06</TaxRate>
      <Amount>44.34</Amount>
      <ComTaxAm>2.66</ComTaxAm>
      <TotaltaxIncludedAmount>47.00</TotaltaxIncludedAmount>
    </IssuItemInformation>
    <SpecificInformation/>
    <AdditionalInformation/>
  </EInvoiceData>
  <TaxSupervisionInfo>
    <InvoiceNumber>26932000001295659876</InvoiceNumber>
    <IssueTime>2026-08-02</IssueTime>
  </TaxSupervisionInfo>
  <SellerAuthentication>
    <AuthenticationMethods>01</AuthenticationMethods>
  </SellerAuthentication>
  <TaxBureauSignature>
    <SignatureAlgorithm>1.2.156.10197.1.501</SignatureAlgorithm>
    <SignatureFormat>DETACH</SignatureFormat>
    <SignatureTime>2026-08-02 16:02:09</SignatureTime>
    <SignatureValue>MIIBxyz...</SignatureValue>
    <KeyInfo/>
    <Reference/>
  </TaxBureauSignature>
</EInvoice>`

console.log('--- dumpTagList ---')
const tagList = e.dumpTagList(xml)
check('还原带连字符的完整路径',
  tagList.some(function (t) { return t.path === 'EInvoice/EInvoiceData/BasicInformation/TotalTax-includedAmount' }), true)
check('还原小写 t 的明细路径',
  tagList.some(function (t) { return t.path === 'EInvoice/EInvoiceData/IssuItemInformation/TotaltaxIncludedAmount' }), true)
check('重复明细行计数为 2',
  tagList.filter(function (t) { return t.path === 'EInvoice/EInvoiceData/IssuItemInformation' })[0].count, 2)

console.log('\n--- XML 路径取值（关键回归点）---')
check('路径取值：BasicInformation 合计（带连字符）',
  e.getText(e.parseXml(xml), 'EInvoice/EInvoiceData/BasicInformation/TotalTax-includedAmount'), '147.00')
check('路径取值：明细行合计（小写 t）首行',
  e.getText(e.parseXml(xml), 'EInvoice/EInvoiceData/IssuItemInformation/TotaltaxIncludedAmount'), '100.00')
check('路径缺失返回 null 而非空串',
  e.getText(e.parseXml(xml), 'EInvoice/EInvoiceData/BuyerInformation/BuyerIdNum'), null)

console.log('\n--- extractInvoice ---')
const f = e.extractInvoice(xml)
check('解析成功', f.ok, true)
check('发票号码', f.invoiceNo, '26932000001295659876')
check('EIid 实测等于发票号码', f.eiid, '26932000001295659876')
check('版本号实测', f.version, '0.37')
check('票种标签实测', f.tag, 'SWEI3302')
check('开票日期取自 TaxSupervisionInfo', f.issueTime, '2026-08-02')
check('申请时间未被误当作开票日期', f.requestTime, '2026-08-02 16:07:11')
check('销方名称', f.seller.name, '宁波顺渝餐饮管理有限公司')
check('销方税号', f.seller.idNum, '91330205MACB4PTU91')
check('个人抬头无买方税号', f.buyer.idNum, null)
check('买方名称', f.buyer.name, '姚未正（个人）')
check('价税合计（不是明细行的 100.00）', f.amount.withTax, '147.00')
check('不含税金额', f.amount.withoutTax, '138.68')
check('税额', f.amount.tax, '8.32')
check('大写金额', f.amount.withTaxCN, '壹佰肆拾柒圆整')
check('票种短名（不是容器的 XML 文本）', f.typeLabel, '普通发票')
check('票种代码', f.labels.vatType.code, '02')
check('数电票类型名', f.labels.eInvoiceType.name, '电子发票')
check('蓝字标志 LabelName 是字段名（不能当状态显示）', f.labels.issuType.name, '是否蓝字发票标志')
check('蓝字标志 LabelCode 是 Y', f.labels.issuType.code, 'Y')
check('归一化后为蓝字票', f.isBlue, true)
check('纳税人类型代码', f.labels.taxpayerType.code, '1')
check('开票人', f.drawer, '林素贞')
check('明细行数', f.itemCount, 2)
check('第 1 行明细合计', f.items[0].withTax, '100.00')
check('第 2 行明细合计', f.items[1].withTax, '47.00')
check('明细税收分类编码（实测 19 位）', f.items[0].taxCode, '3070401000000000000')
check('检出税务签名', f.signature.present, true)
check('签名算法 OID 原值', f.signature.algorithm, '1.2.156.10197.1.501')
check('签名算法可读名', f.signature.algorithmName, 'SM2')
check('签名格式为分离式', f.signature.detached, true)
check('签名时间', f.signature.time, '2026-08-02 16:02:09')
check('必填项无缺失', f.missing, [])

console.log('\n--- 异常输入 ---')
check('非数电票 XML', e.extractInvoice('<foo><bar>x</bar></foo>').ok, false)
check('BOM 可容忍', e.extractInvoice('\uFEFF' + xml).ok, true)

console.log('\n--- parseLegacyQr（S1 真实样本）---')
const REAL_QR = '01,31,,26932000001877489821,10500.00,20261110,,277D'
const qr = e.parseLegacyQr(REAL_QR)
check('发票号码（20 位）', qr.invoiceNo, '26932000001877489821')
check('发票代码为空', qr.invoiceCode, '')
check('价税合计', qr.amount, '10500.00')
check('开票日期', qr.issueDate, '20261110')
check('校验码为空', qr.checkCode, '')
check('CRC 原值保留', qr.crcDeclared, '277D')
check('票种推断', qr.invoiceType, '数电票')
check('字段不足返回 null', e.parseLegacyQr('01,31'), null)

console.log('\n--- guessInvoiceType ---')
check('20 位 + 第5位8 → 航空', e.guessInvoiceType('31', '26938000000000000001', ''), '航空运输电子客票行程单')
check('20 位 + 第5位9 → 铁路', e.guessInvoiceType('31', '26939000000000000001', ''), '铁路电子客票')
check('20 位普通 → 数电票', e.guessInvoiceType('31', '26932000000000000001', ''), '数电票')
check('票种码 10 → 电子普票', e.guessInvoiceType('10', '12345678', '044031900111'), '增值税电子普通发票')
check('票种码 20 → 电子专票', e.guessInvoiceType('20', '12345678', '044031900111'), '增值税电子专用发票')

console.log('\n--- classifyQr ---')
check('明文串', e.classifyQr(REAL_QR), 'legacy-csv')
check('链接', e.classifyQr('https://dppt.gd.chinatax.gov.cn:8443/invoice?v=abc'), 'url')
check('空值', e.classifyQr(''), 'empty')
check('未知格式', e.classifyQr('随便一段文字'), 'unknown')

console.log('\n--- detectEncoding（S3 实测 utf-8）---')
const utf8 = new Uint8Array(Buffer.from('<?xml version="1.0" encoding="utf-8"?><a/>', 'utf8'))
check('UTF-8', e.detectEncoding(utf8).declared, 'utf-8')
const gbk = new Uint8Array(Buffer.from('<?xml version="1.0" encoding="GBK"?><a/>', 'utf8'))
check('GBK 有警示', e.detectEncoding(gbk).note.length > 0, true)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
