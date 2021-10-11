var SUPABASE_URL = 'https://grbgsuelgpoqmrnnykvk.supabase.co'
var WAX_API_URL = 'https://seekwellapi.ngrok.io/api'
var apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMzQ2MTQ3NywiZXhwIjoxOTQ5MDM3NDc3fQ.AFyUwdb1zLohzOoGSZnmsI14NU-njXvxBP5F3IC7z8M'
let waxApiKey = 'ff162314-3749-441e-82cd-70c83c65de71'

var icons = [
  '1', '2', '3', '4', '5', 
  'a', 'b', 'c', 'd', 'e', 
  'approved', 'declined', 
  'yes', 'no', 
  'delete', 'run', 'update', 'new',
  'submit',
]

function testSendEmail(opts) {
  // https://developers.google.com/apps-script/reference/gmail/gmail-app#sendemailrecipient,-subject,-body,-options
  
  var now = new Date();
  opts = {
    recipient: 'mike@wax.run',
    msg: `testing from appsscript ${now.toString()}`,
    title: 'testing...',
  }
  // The code below will send an email with the current date and time.
  // sendEmail(recipient, subject, body, options) 
  // let emailRes = GmailApp.sendEmail(recipient=opts.recipient, subject=opts.title, htmlBody=opts.msg);
  // console.log('emailRes: ', emailRes. )
  let res = sendEmail(opts)
}

function gasNewReport(reportNum) {
  reportNum = reportNum || 1
  console.log('gasNewReport...', reportNum)
  let reportName = `report${reportNum}`
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(reportName)
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(reportName)
    let cols = ['type',	'name',	'config',	'configOk']
    sheet.getRange('A1').setValue('SQL')
    sheet.getRange('A1').setBackground('#1a202c')
    sheet.getRange('A1').setFontColor('#fff')
    sheet.getRange('A1').setFontWeight("bold");
    sheet.setRowHeight(1, 100);
    sheet.setTabColor('#1a202c')
    sheet.getRange('B1').setValue('select *\nfrom table_name\nlimit ' + '${' + reportName + '!B2}')
    let queryCells = sheet.getRange(`B1:E1`)
    queryCells.setBackground('#d9d9d9')
    queryCells.setFontFamily('Roboto Mono')
    queryCells.mergeAcross()
    sheet.getRange('A2').setValue('limit')
    sheet.getRange('B2').setValue('10')

    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet)
    sheet.getRange("B1").activate();
    gasAddButton({name: 'run', sheetName: reportName})
  } else {
    gasNewReport(reportNum+1)
  }
}

function gasSyncNow(sheetsMeta) {
  let tables = 0
  gasAddWaxDotRunSheet()
  for (const key of Object.keys(sheetsMeta)) {
      let sheet = sheetsMeta[key]
      if (sheet.selected) {
        tables+=1
        console.log('sheetsMeta sync: ', key);
        syncOneSheet(sheet)
        pushToWaxDotRun(sheet)
      }
  }
  let opts = {
    title: `✅ Wax is done`,
    msg: `Sync completed on ${tables} tables`,
    timeout: 8,
  }
  msgAndLog(opts)
}

function getRealLastRow(sheet) {
  let rows = sheet.getRange(`A1:A10`).getValues()
  console.log('getRealLastRow rows: ', rows)
  for (let index = 0; index < rows.length; index++) {
    if (rows[index][0].length === 0) return index+1
  }
}

function pushToWaxDotRun(row) {
  console.log('pushToWaxDotRun: ', row)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('wax.run');
  if (!sheet) {
    console.error('no wax.run sheet')
  }
  let lastRow = getRealLastRow(sheet)
  console.log('pushToWaxDotRun lastRow: ', lastRow)
  var rows2 =[
    'table',
    row.name,
    JSON.stringify(row.config)
  ]
  console.log('pushToWaxDotRun: ', rows2)
  let res = sheet.getRange(`A${lastRow}:C${lastRow}`).setValues([rows2])
  console.log('pushToWaxDotRun push res: ', res)
}

function syncOneSheet(sync) {
  let cols = getColsForCreateTable(sync)
  console.log('syncOneSheet getColsForCreateTable: ', cols)
  sync.cols = cols
  let meta = {
    data: { 't_name': sync.name, 'cols': cols.sqlColStr },
    name: 'create_table'
  }
  // this creates an empty table, DOES NOT DROP
  getSupaRpc(meta)
  upsertSheetToSupa(sync)
}

function gasGoToSheet(name) {
  sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet)
}

function getSheetTableMeta(table, limit) {
  let cols = table[0]
  let rows = table.slice(1)
  let numOfRows = rows.length
  if (limit) {
    rows = rows.slice(0, limit)
  }
  return {cols: cols, rows: rows, limit: limit || -1, numOfRows: numOfRows}
}

function gasGetAllSheetsMeta(name) {
  // get all sheets
  // convert all the sheets to tables
  // return cols and rows for the sheet
  let sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets()
  let meta = {}
  for (let index = 0; index < sheets.length; index++) {
    var sheet = sheets[index]
    let sheetName = sheet.getName()
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
    console.log('gasGetAllSheetsMeta sheet name ', sheetName, sheet)
    let table = getTableFromSheet(sheet)
    if (!table.ok) continue
    meta[sheetName] = getSheetTableMeta(table.table, 3)
    meta[sheetName].name = sheetName
    meta[sheetName].index = sheet.getIndex()
    meta[sheetName].id = sheet.getSheetId()
    meta[sheetName].toggled = false
    meta[sheetName].selected = false
    meta[sheetName].config = {}
    if (meta[sheetName].cols.includes('id')) {
      meta[sheetName].config.key = 'id'
      meta[sheetName].config.keyType = 'auto'
    } else if (meta[sheetName].cols.includes('uuid')) {
      meta[sheetName].config.key = 'uuid'
      meta[sheetName].config.keyType = 'uuid'
    } else if (meta[sheetName].cols.includes('email')) {
      meta[sheetName].config.key = 'email'
    }
  }
  console.log('gasGetAllSheetsMeta meta ', meta)
  return JSON.stringify(meta)
}

function gasAddWaxDotRunSheet() {
  console.log('gasAddWaxDotRunSheet...')
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('wax.run')
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('wax.run')
    let cols = ['type',	'name',	'config',	'configOk']
    let colRange = sheet.getRange(1,1, 1, cols.length)
    colRange.setValues([cols])
    colRange.setBackground('#1a202c')
    colRange.setFontColor('#fff')
    colRange.setFontWeight("bold");
    sheet.setColumnWidth(3, 300);
    sheet.setTabColor('#1a202c')
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet)
    sheet.getRange("A1").activate();
    sheet.getRange('D2:D100')
    okRow = 2
    while (okRow < 100) {
      sheet.getRange(`D${okRow}`).setValue(`=validateJson(C${okRow})`)
      okRow+=1
    }
  } else {
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet)
    sheet.getRange("A1").activate();
  }
}

function sendEmail(opts) {
  // https://developers.google.com/apps-script/reference/gmail/gmail-app#sendemailrecipient,-subject,-body,-options
  // sendEmail(recipient, subject, body, options) 
  // GmailApp.sendEmail(recipient=opts.recipient, subject=opts.title, htmlBody=opts.msg);
  let draft = GmailApp.createDraft(recipient=opts.recipient, subject=opts.title, htmlBody=opts.msg)
  let sent = draft.send()
  let ret = {
    id: sent.getId(),
    body: sent.getRawContent() ,
  }
  console.log('sendEmail results: ', ret.body )
  Logger.log(ret.body)
  return ret
}

function validateJson(j) {
  if (j === '') return ''
  try {
    JSON.parse(j)
    return 'ok'
  } catch (err) {
    // console.log('validateJson JSON.parse error: ', err)
    return String(err)
  }
}

function runSql(opts) {
  let defOpts = {
    sql: 'select * from test limit 3', 
    knex: true,
  }
  opts = opts || defOpts
  opts.knex = true
  let email = Session.getEffectiveUser().getEmail();
  let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
  
  let url = WAX_API_URL
  let options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(opts),
      'headers' : {
        'apikey' : waxApiKey,
      }
  };
  let response = UrlFetchApp.fetch(url, options);
  let results = JSON.parse(response)
  
  console.log('runSql:', results)
  opts.sheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName()
  if (results.ok) {
    SpreadsheetApp.getActive().toast(`Got ${results.data.rowCount} rows, writing to ${opts.sheetName}`);
    writeRangeKnex(results.data.rows, opts)
  } else {
    opts.msg = `${results.errorStr}`
    opts.title = `❌ Wax Error`
    opts.timeout = 15
    msgAndLog(opts)
  }
  
  return results
}

function onOpen() {
    console.log('onOpen v2...')
    SpreadsheetApp.getUi()
        .createMenu('Wax')
        .addItem('Launch', 'launch')
        .addToUi();
  }
  
  function launch() {
    // let meta = {
    //   data: { "get_table": "test" },
    //   name: 'get_metadata'
    // }
    // getSupaRpc(meta)
    let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
    console.log('launch ss_id...', ss_id)
    var html = HtmlService.createHtmlOutputFromFile('Page')
        .setTitle('Wax');
    SpreadsheetApp.getUi()
        .showSidebar(html);
    var configs = gasGetWaxDotRun()
    configs = configs.slice(1)
    gasRunConfig(configs)
    gasUpdateTriggers({})
    console.log('launch v2...')
  }
  
  function gasRunConfig(configs) {
    // type	value	config
    // table	test	*
    for (let index = 0; index < configs.length; index++) {
      const config = getConfigObj(configs[index]);
      if (!config.type || config.type.length === 0) break
      if (config.type === 'table') {
        getSupaTable(config)
      }
    }
  }

  function gasGetWaxDotRunConfigs() {
    let waxDotRun = gasGetWaxDotRun()
    let configs = []
    for (let index = 0; index < waxDotRun.length; index++) {
      const config = getConfigObj(waxDotRun[index]);
      configs.push(config)
    }
    return configs
  }
  
  function getConfigObj(r) {
    let d = {}
    d.type = r[0]
    d.name = r[1]
    try {
      d.config = JSON.parse(r[2])
    } catch (err) {
      console.log('JSON.parse error: ', r, err)
      d.config = {}
    }
    return d
  }
  
  function gasGetWaxDotRun() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('wax.run');
    if (!sheet) return []
    let lastRow = getRealLastRow(sheet)
    let rows = sheet.getRange(`A1:C${lastRow}`).getValues()
    console.log('gasGetWaxDotRun done. ', rows.length)
    return rows
  }
  
  function gasUpdateTriggers(d) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var ssId = ss.getId()
      var triggers = ScriptApp.getUserTriggers(ss);
      var settings = PropertiesService.getDocumentProperties();
      var sync = {}
      console.log('settings: ', settings)
      if (settings.sync) {
          console.log('settings.sync: ', settings.sync)
          sync = JSON.parse(settings.sync)
      }
      var triggerNeeded = true
      var existingTrigger = null;
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getEventType() == ScriptApp.EventType.ON_EDIT) {
          existingTrigger = triggers[i];
          console.log('existingTrigger: ', existingTrigger)
          ScriptApp.deleteTrigger(existingTrigger);
        }
        if (triggers[i].getEventType() == ScriptApp.EventType.ON_CHANGE) {
          existingTrigger = triggers[i];
          console.log('existingTrigger: ', existingTrigger)
          ScriptApp.deleteTrigger(existingTrigger);
        }
      }
      var trigger = ScriptApp.newTrigger(`waxOnEdit`)
        .forSpreadsheet(ss)
        .onEdit()
        .create();
      var trigger = ScriptApp.newTrigger(`waxOnChange`)
        .forSpreadsheet(ss)
        .onChange()
        .create();
  }
  
  function getSupaTable(opts) {
      let email = Session.getEffectiveUser().getEmail();
      let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
      let url = `${SUPABASE_URL}/rest/v1/${opts.name}`
      if (opts.config.key) {
        url+= `?order=${opts.config.key}`
      }
      let options = {
        'method': 'get',
        'contentType': 'application/json',
        // 'payload': JSON.stringify(data),
        'muteHttpExceptions': true,
        'headers' : {
          'apikey' : apiKey,
          'Authorization': `Bearer ${apiKey}`
        }
      };
      let response = UrlFetchApp.fetch(url, options);
      let resCode = response.getResponseCode()
      if (resCode >= 400) {
        Logger.log('getSupaTable getContentText: ')
        let err = JSON.parse(response.getContentText())
        // Logger.log('getSupaTable getContentText: ')
        if (err.message.includes('does not exist')) {
          console.log('getSupaTable does not exist, creating...');
          let cols = getColsForCreateTable(opts)
          let meta = {
            data: { 't_name': opts.name, 'cols': cols.sqlColStr },
            name: 'create_table'
          }
          getSupaRpc(meta)
          opts.cols = cols
          upsertSheetToSupa(opts)
        }
        return err
      }
      let results = JSON.parse(response)
      Logger.log('getSupaTable results: ')
      writeRange(results, opts.name)
      return results
      // console.error('getSupaTable', err);
      // var err2 = JSON.parse(JSON.stringify(err))
      // console.error('getSupaTable2', err2);
  }
  
  function getAlphabetFromNum(num) {
    return (num + 9).toString(36).toUpperCase()
  }

  function upsertSheetToSupa(opts) {
    console.log('upsertSheetToSupa: ', opts)
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.name);
    let endColAlpha = (opts.cols.cols.length + 9).toString(36).toUpperCase()
    var rows = sheet.getRange(`A:${endColAlpha}`).getValues()
    let cols = rows[0]
    rows = rows.slice(1)
    rows2 = []
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.length > 1 && !row[0] && !row[1]) {
          break
        } else if (row.length === 1 && !row[0]) {
          break
        }
        const row2 = {}
        for (let index2 = 0; index2 < cols.length; index2++) {
          if (cols[index2] === opts.config.key && ['auto', 'uuid'].includes(opts.config.keyType)) {
            // delete / dont include key in row
          } else {
            row2[cols[index2]] = row[index2]
          }
        }
        rows2.push(row2)
    }
    console.log('rows2: ', rows2)
    opts.data = rows2
    insertSupa(opts)
  }
  
  function getColsForCreateTable(opts) {
    console.log('getColsForCreateTable', opts)
    let sheetName = opts.name
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName)
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      let demoVals = [
        ['col_str', 'col_num', 'col_json'],
        ['value1', 1, `{"some": "val"}`],
      ]
      sheet.getRange('A1:C2').setValues(demoVals)
    }
    let cols = getColsForSheet(opts)
    // getRange(row, column, numRows) 
    // TODO: fix range and use alphabet to get correct range
    let firstRow = sheet.getRange('A1:Z1').getValues()[0]
    let cols2 = ''
    for (let index = 0; index < cols.length; index++) {
      var col = ''
      if (cols[index].name === opts.config.key && opts.config.keyType === 'auto') {
        col = `${cols[index].name} SERIAL PRIMARY KEY`
      } else if (cols[index].name === opts.config.key && opts.config.keyType === 'uuid') {
        col = `${cols[index].name} uuid DEFAULT gen_random_uuid() PRIMARY KEY`
      } else {
        col = `"${cols[index].name}" ${cols[index].type}`
      }
      cols2 += col
      console.log('cols2', cols2)
      if (index < cols.length - 1) {
        cols2 += ','
      }
    }
    console.log('cols2', cols2)
    return {sqlColStr: cols2, cols: cols}
  }
  
  function getColsForSheet(opts) {
    let sheetName = opts.name
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      console.error('getColsForSheet no sheet', opts)
      return []
    }
    let numOfCols = 3
    // getRange(row, column, numRows) 
    // TODO: fix range and use alphabet to get correct range
    let firstRow = sheet.getRange('A1:Z2').getValues()[0]
    let secondRow = sheet.getRange('A1:Z2').getValues()[1]
    let cols = []
    let js2pgTypes = {'string': 'text', 'number': 'numeric', 'object': 'text'}
    for (let index = 0; index < firstRow.length; index++) {
      const val = firstRow[index];
      var t = 'text'
      try {
        t = typeof(secondRow[index])
        t = js2pgTypes[t]
        if (!t) t = 'text'
      } catch (err) {
        // not int
      }
      if (!val) break
      cols.push({name: val, type: t})
    }
    return cols
  }
  
  function getSupaRpc(opts) {
    let email = Session.getEffectiveUser().getEmail();
    let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
    let url = `${SUPABASE_URL}/rest/v1/rpc/${opts.name}`
    let options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(opts.data),
        'headers' : {
          'apikey' : apiKey,
          'Authorization': `Bearer ${apiKey}`,
        }
    };
    let response = UrlFetchApp.fetch(url, options);
    let results = JSON.parse(response)
    console.log('getSupaRpc:', results)
    return results
  }

  function upsertSupa(opts) {
      let email = Session.getEffectiveUser().getEmail();
      let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
      let key = opts.data[opts.config.key]
      let url = `${SUPABASE_URL}/rest/v1/${opts.name}`
      let options = {
          'method': 'post',
          'contentType': 'application/json',
          'payload': JSON.stringify(opts.data),
          'muteHttpExceptions': true,
          'headers' : {
            'apikey' : apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Prefer': 'resolution=merge-duplicates, return=representation',
          }
      };
      let response = UrlFetchApp.fetch(url, options);
      console.log('upsertSupa response: ', response)
      console.log('upsertSupa response text: ', response.getContentText())
      let results = JSON.parse(response)
      console.log('upsertSupa results: ', results)
      if (opts.config.key && !key && results.length === 1 && results[0][opts.config.key]) {
        console.log('adding key to sheet row range: ', opts.range)
        let newKeyVal = results[0][opts.config.key]
        console.log('newKeyVal: ', newKeyVal)
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.name);
        let fullEditedRange = sheet.getRange(opts.range.rowStart, 1, 1, 1).setValues([[newKeyVal]]);
      }
      if (results && results.length > 0) {
        opts.msg = `Updated ${results.length} rows`
        msgAndLog(opts)
      }
      return results
  }

  function msgAndLog(opts) {
    console.log('msgAndLog: ', opts)
    let email = Session.getEffectiveUser().getEmail();
    let dt = new Date()
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
    let sheetName = opts.sheetName || sheet.getName()
    var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('wax.log')
    if (!logSheet) {
      logSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('wax.log')
      // logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('wax.log');
      let cols = ['email', 'date', 'sheet', 'message']
      let colRange = logSheet.getRange(1,1, 1, cols.length)
      colRange.setValues([cols])
      colRange.setBackground('#1a202c')
      colRange.setFontColor('#fff')
      colRange.setFontWeight("bold");
      
    }
    let lastRow = logSheet.getLastRow()
    let row = [email, dt, sheetName, opts.msg]
    console.log('msgAndLog: ', lastRow)
    logSheet.getRange(lastRow + 1,1, 1, row.length).setValues([row]);
    SpreadsheetApp.getActiveSpreadsheet().toast(opts.msg, opts.title || 'Wax', opts.timeout || 7);
  }

  function updateOneRowSupa(opts) {
      let email = Session.getEffectiveUser().getEmail();
      let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
      let key = opts.data[opts.config.key]
      let url = `${SUPABASE_URL}/rest/v1/${opts.name}?${opts.config.key}=eq.${key}`
      let options = {
          'method': 'patch',
          'contentType': 'application/json',
          'payload': JSON.stringify(opts.data),
          'muteHttpExceptions': true,
          'headers' : {
            'apikey' : apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Prefer': 'return=representation'
          }
      };
      let response = UrlFetchApp.fetch(url, options);
      let results = JSON.parse(response)
      console.log('updateOneRowSupa results: ')
      return results
  }

  function insertSupa(opts) {
      let email = Session.getEffectiveUser().getEmail();
      let ss_id = SpreadsheetApp.getActiveSpreadsheet().getId();
      let key = opts.data[opts.config.key]
      let url = `${SUPABASE_URL}/rest/v1/${opts.name}`
      console.log('insertSupa opts.data: ', opts.data)
      let options = {
          'method': 'post',
          'contentType': 'application/json',
          'payload': JSON.stringify(opts.data),
          'muteHttpExceptions': true,
          'headers' : {
            'apikey' : apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Prefer': 'return=representation'
          }
      };
      let response = UrlFetchApp.fetch(url, options);
      let results = JSON.parse(response)
      console.log('insertSupa results: ', results)
      if (results.message && results.code) {
        console.error('insertSupa error: ', results)
        return results
      }
      updateKeysAfterInsert(results, opts)
      return results
  }

  function updateKeysAfterInsert(results, opts) {
    let keys = results.map(r => [r[opts.config.key]])
    let keyIndex = opts.cols.cols.findIndex(c => c.name === opts.config.key)
    let keyAlphaIndex = getAlphabetFromNum(keyIndex+1)
    console.log('keys: ', keyIndex, keys)
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.name);
    let a1 = `${keyAlphaIndex}2:${keyAlphaIndex}${keys.length+1}`
    console.log('a1: ', a1)
    var rows = sheet.getRange(a1).setValues(keys)
  }

  function writeRangeKnex(d, opts) {
    if (d.length === 0) return
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.sheetName);
    if (!sheet) {
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(opts.sheetName)
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.sheetName);
    }
    var cols = Object.keys(d[0])
    var rows = []
    rows.push(cols)
    for (let index = 0; index < d.length; index++) {
      const row = d[index];
      rows.push(Object.values(row))
    }
    let startRow = 4
    // getRange(row, column, numRows, numColumns) 
    sheet.getRange(startRow, 1, rows.length, cols.length).setValues(rows);
    SpreadsheetApp.getActive().toast(`Done writing ${rows.length} rows to ${opts.sheetName}`);
  }
  
  function writeRange(d, table) {
    if (d.length === 0) return
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(table);
    if (!sheet) {
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(table)
      sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(table);
    }
    var cols = Object.keys(d[0])
    var rows = []
    rows.push(cols)
    for (let index = 0; index < d.length; index++) {
      const row = d[index];
      rows.push(Object.values(row))
    }
    // append
    // var lastRow = sheet.getLastRow();
    // sheet.getRange(lastRow + 1,1, rows.length, rows[0].length).setValues(rows);
    // replace
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  function waxOnChange(e) {
    Logger.log('waxOnChange')
    Logger.log(JSON.stringify(e))
  }
  
  function gasHandleSupaRealTime(d) {
    console.log('gasHandleSupaRealTime')
    var realTimePaused = false
    if (realTimePaused) {
      console.log('realTimePaused')
    }
    let configs = gasGetWaxDotRunConfigs()
    console.log('configs: ', configs)
    let tableConfig = configs.find(c => (c.name === d.table && c.type === 'table'))
    if (tableConfig) {
      console.log('gasHandleSupaRealTime', tableConfig)
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tableConfig.name);
      let table = getTableFromSheet(sheet)
      let tableMeta = getSheetTableMeta(table.table, false)
      let numOfCols = tableMeta.cols.length
      // getRange(row, column, numRows) 
      // TODO: fix range and use alphabet to get correct range
      let endColAlpha = getAlphabetFromNum(numOfCols)
      let rows = tableMeta.rows
      let cols = tableMeta.cols
      let indexOfKey = cols.indexOf(tableConfig.config.key)
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row[indexOfKey] === d.new[tableConfig.config.key]) {
          let range = sheet.getRange(index+2, 1, 1, numOfCols)
          let newRow = []
          for (let index2 = 0; index2 < cols.length; index2++) {
            const col = cols[index2];
            newRow.push(d.new[col])
          }
          console.log('newRow', newRow)
          range.setValues([newRow])
        }
      }
    }
    return {ok: true}
  }

  function getSheetRowAndHeaders(config, e, r) {
    let sheet = e.range.getSheet()
    // let cols = sheet.getRange(`A:Z`);
    console.log('getSheetRowAndHeaders config: ', config)
    config.name = config.config.condition.sheet
    let cols = getColsForSheet(config)
    console.log('getSheetRowAndHeaders cols: ', cols)
    let fullEditedRange = sheet.getRange(r.rowStart, 1, 1, cols.length).getValues()[0];
    for (let index = 0; index < cols.length; index++) {
      cols[index].value = fullEditedRange[index]
    }
    return cols
  }

  function stringTemplateParser(expression, valueObj) {
    // format
    const templateMatcher = /\${\s?([^{}\s]*)\s?}/g;
    let text = expression.replace(templateMatcher, (substring, value, index) => {
      value = valueObj[value];
      return value;
    });
    return text
  }

  function demoButtonAction() {
    SpreadsheetApp.getActive().toast("Why is it called Wax?");
  }

  function gasBtnAction(e) {
    SpreadsheetApp.getActive().toast(`Running ${e}`);
  }

  function insertImageOnSheet(opts) {
    opts = opts || {name: 'imageStuff'}
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(opts.name);

    var response = UrlFetchApp.fetch(
      'https://www.wax.run/btn-run.png');
    var binaryData = response.getContent();

    // Insert the image in cell A1.
    var blob = Utilities.newBlob(binaryData, 'image/png', 'MyImageName23232431');
    blob.ass
    let img = sheet.insertImage(blob, 1, 1);
    img.assignScript('btnRun')
  }

  function btnRun() {
    btnMaster('run')
  }

  function formatSql(sql) {
    console.log('formatSql: ', sql)
    const templateMatcher = /\${\s?([^{}\s]*)\s?}/g;
    let matches = sql.match(templateMatcher)
    console.log('formatSql matches: ', matches)
    if (!matches || matches.length === 0) return sql
    let replacements = {}
    for (let index = 0; index < matches.length; index++) {
      let match = matches[index]
      match = match.replace('${', '')
      match = match.replace('}', '')
      console.log('match: ', match)
      replacements[match] = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(match).getValue()
    }
    sql = stringTemplateParser(sql, replacements)
    console.log('sql after matches: ', sql)
    return sql
  }

  function btnMaster(btnType) {
    if (btnType === 'run') {
      let sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
      let cell = sheet.getRange('B1').getValue()
      console.log('cell: ', cell)
      SpreadsheetApp.getActive().toast(`Running: ${cell}`);
      let sql = formatSql(cell)
      console.log('sql: ', sql)
      runSql({sql: sql})
    }
  }

  function gasAddButton(btn) {
    console.log('gasAddButton: ', btn)
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(btn.sheetName);
    var response = UrlFetchApp.fetch('https://www.wax.run/btn-run.png');
    var binaryData = response.getContent();
    var blob = Utilities.newBlob(binaryData, 'image/png', `${btn.sheetName}-btn-run.png`);
    blob.ass
    let img = sheet.insertImage(blob, 5, 1);
    img.assignScript('btnRun')
    img.setAltTextTitle(btn.name)
    let firstSheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    firstSheet.activate()
    SpreadsheetApp.flush();
    sheet.activate();
  }

  function doWorkflow(config, e) {
    console.log('workflow: ', config)
    let sheet = e.range.getSheet()
    let sheetName = sheet.getName()
    if (config.config.condition && config.config.condition.sheet != sheetName) {
      console.log('edit not on workflow sheet')
      return false
    }
    var r = JSON.parse(JSON.stringify(e.range))
    if (config.config.steps) {
      for (let index = 0; index < config.config.steps.length; index++) {
        const step = config.config.steps[index];
        let colsAndData = getSheetRowAndHeaders(config, e, r)
        console.log('colsAndData: ', colsAndData)
        if (step.type === 'webhook') {
          var data = {
            name: colsAndData[r.columnStart-1].name,
            value: e.value || colsAndData[r.columnStart-1].value,
            oldValue: e.oldValue || 'pasted',
          }
          if (step.data) {
            var send = stringTemplateParser(step.data, data)
            console.log('sending webhook1b: ', send)
            send = eval(`(${send})`)
            console.log('sending webhook1b2: ', send)
            send = JSON.stringify(send)
            console.log('sending webhook1b3: ', send)
          } else {
            console.log('using raw data webhook1c: ', send)
            var send = JSON.stringify(data)
          }
          console.log('sending webhook2: ', send)
          let options = {
            'method': step.method || 'post',
            'contentType': step.contentType || 'application/json',
            'payload': send,
            'muteHttpExceptions': true,
          };
          let response = UrlFetchApp.fetch(step.url, options);
          console.log('sending webhook getResponseCode: ', response.getResponseCode())
          console.log('sending webhook response getContentText: ', response.getContentText())
        } else if (step.type === 'email') {
          let status = colsAndData.find(c => c.name === step.status)
          let recipient = colsAndData.find(c => c.name === step.recipient)
          console.log('email status: ', status)
          if (!recipient.value || recipient.value.length < 4) {
            console.log('Invalid email addresss value: ', recipient.value)
            opts = {
              msg: `Invalid email address`,
              title: `❌ Wax Error`,
              timeout: 15,
            }
            msgAndLog(opts)
            return {ok: false, error: 'invalidEmail'}
          }
          if (status.value === '' || status.value === 'pending') {
            let msgCell = SpreadsheetApp.getActiveSpreadsheet().getRange(step.msgCell).getValue()
            let titleCell = SpreadsheetApp.getActiveSpreadsheet().getRange(step.titleCell).getValue()
            let msg = formatEmail(msgCell, colsAndData)
            let title = formatEmail(titleCell, colsAndData)
            let emailOpts = {
              recipient: recipient.value,
              msg: msg,
              title: title
            }
            let emailRes = sendEmail(emailOpts)
            let configs = gasGetWaxDotRunConfigs()
            console.log('configs: ', configs)
            let tableConfig = configs.find(c => (c.name === config.config.condition.sheet && c.type === 'table'))
            console.log('tableConfig: ', tableConfig)
            // updateSheetByColumnAndKey(sheetName, colsAndData, keyName, newVal)
            updateSheetByColumnAndKey(sheetName=config.config.condition.sheet, 
              colsAndData=colsAndData, keyName=tableConfig.config.key, 
              newVal='sent', colName='WelcomeStatus', note=emailRes.body)
            opts = {
              msg: `Message sent to ${recipient.value} (${emailRes.id})`,
              title: `✅ Wax is done`,
              timeout: 15,
            }
            msgAndLog(opts)
          }
        }
      }
    }
  }

  function getTableFromSheet(sheet) {
    console.log('getTableFromSheet... ')
    let firstRow = sheet.getRange(`A1:Z1`).getValues()[0]
    console.log('getTableFromSheet firstRow: ', firstRow)
    let lastRowNum = sheet.getLastRow()
    let cols = []
    for (let index = 0; index < firstRow.length; index++) {
      let col = firstRow[index]
      if (col && col.length > 0) {
        cols.push(col)
      } else {
        break
      }
    }
    let numOfCols = cols.length
    console.log('cols, ', numOfCols, cols, lastRowNum)
    if (numOfCols === 0) {
      console.log('getTableFromSheet, no cols...')
      return {ok: false, 'error': 'noCols'}
    }
    // getRange(row, column, numRows, numColumns) 
    let table = sheet.getRange(row=1, column=1, numRows=lastRowNum, numColumns=numOfCols).getValues()
    return {ok: true, table: table}
  }

  function getRowByKey(table, key, keyName) {
    console.log('getRowByKey: ', table, key, keyName)
    let cols = table[0]
    let indexOfKey = cols.indexOf(keyName)
    console.log('indexOfKey: ', indexOfKey)
    let rows = table.slice(1)
    for (let index = 0; index < rows.length; index++) {
      row = rows[index]
      if (row[indexOfKey] === key) {
        return {row: row, rowIndex: index, colIndex: indexOfKey}
      }
    }
    return false
  }

  function updateSheetByColumnAndKey(sheetName, colsAndData, keyName, newVal, colName, note) {
    // get the sheet
    // find the row by id
    // update col num using the id name
    // update the row
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
    var table = getTableFromSheet(sheet)
    if (!table.ok) {
      console.log('updateSheetByColumnAndKey, not a table')
    } else {
      table = table.table
    }
    let key = colsAndData.find(d => d.name === keyName)
    let colIndex = colsAndData.findIndex(d => d.name === colName)
    let row = getRowByKey(table=table, key=key.value, keyName=keyName)
    console.log('updateSheetByColumnAndKey row: ', row)
    let range = sheet.getRange(row.rowIndex+2, colIndex+1)
    range.setValue(newVal)
    if (note) {
      range.setNote(note)
    }
  }

  function formatEmail(text, colsAndData) {
    const templateMatcher = /\${\s?([^{}\s]*)\s?}/g;
    let matches = text.match(templateMatcher)
    console.log('formatEmail matches: ', matches)
    if (!matches || matches.length === 0) return text
    let replacements = {}
    for (let index = 0; index < matches.length; index++) {
      let match = matches[index]
      match = match.replace('${', '')
      match = match.replace('}', '')
      console.log('match: ', match)
      if (match.includes('!')) {
        replacements[match] = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(match).getValue()
      } else {
        let colsAndDataItem = colsAndData.find(c => c.name === match)
        if (colsAndDataItem) {
          replacements[match] = colsAndDataItem.value
        }
      }
    }
    text = stringTemplateParser(text, replacements)
    console.log('msg after matches: ', text)
    return text
  }
  
  function waxOnEdit(e) {
    console.log('waxOnEdit', JSON.stringify(e))
    // let config = [
    //   {
    //     type: 'table', 
    //     value: 'test', 
    //     config: {
    //       columns: ['id', 'created_at', 'test_column'],
    //       key: 'id'
    //     }
    //   }
    // ]
    var waxDotRunSheet = gasGetWaxDotRun()
    waxDotRunSheet = waxDotRunSheet.slice(1)
    configs = []
    for (let index = 0; index < waxDotRunSheet.length; index++) {
      const config = getConfigObj(waxDotRunSheet[index]);
      // console.log('config: ', config)
      if (!config.type) break
      if (config.type === 'workflow') {
        doWorkflow(config, e)
      }
      configs.push(config)
    }
    // let ss = SpreadsheetApp.getActiveSpreadsheet()
    let sheet = e.range.getSheet()
    let sheetName = sheet.getName()
    let table = configs.find(c => c.type === 'table' && c.name === sheetName)
    if (table) {
      // TODO: replace with either config or getting the full first row
      let firstRow = sheet.getRange(`A1:Z1`).getValues()[0]
      let cols = []
      for (let index = 0; index < firstRow.length; index++) {
        let col = firstRow[index]
        if (col && col.length > 0) {
          cols.push(col)
        } else {
          break
        }
      }
      let numOfCols = cols.length
      console.log('cols, ', numOfCols, cols)
      let supaUpdate = {}
      // "range":{"columnEnd":3,"columnStart":3,"rowEnd":8,"rowStart":8}
      let r = JSON.parse(JSON.stringify(e.range))
      // getRange(row, column, numRows, numColumns) 
      let fullEditedRange = sheet.getRange(r.rowStart, 1, 1, numOfCols).getValues()[0];
      table.range = r
      for (let index = 0; index < cols.length; index++) {
        const col = cols[index];
        supaUpdate[col] = fullEditedRange[index]
        // let opts = {
        //   data: supaUpdate,
        //   table: table
        // }
      }
      if (table.config.key && table.config.key in supaUpdate) {
        let keyVal = supaUpdate[table.config.key]
        // if the id doesn't have a value, remove it from update obj
        if (!keyVal) delete supaUpdate[table.config.key]
      }
      table.data = supaUpdate
      console.log('supaUpdate table', table)
      let upsertRes = upsertSupa(table)
      // TODO: add the id back to the row
    }
    
    // save the config sheet on edit somewhere so you don't need to read it everytime
    // TODO: if the name = a name in the config, write the edit back to supa
  }
  
  // function doesThisWork() {
  //   Logger.log('yes?????')
  // }
  
  // gasUpdateTriggers({})
  
  
