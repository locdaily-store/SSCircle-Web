/* SSCircle Server: protected, in-browser spreadsheet + Excel workbook export.
   Operates on authenticated response data; never fetches public submissions. */

// Tabel data pendaftar dan ekspor spreadsheet.

'use strict';
const SSCircleSheet = (() => {
  const $ = id => document.getElementById(id);
  const create = (tag, text, cls = '') => {
    const el = document.createElement(tag);
    if (text !== undefined)
      el.textContent = String(text);
    if (cls)
      el.className = cls;
    return el;
  };
  const PAGE_ROWS = 100;
  let state = {
    data: null,
    questions: [],
    applicantName: null,
    valueText: null,
    showDetails: null,
    page: 0,
    query: '',
    status: 'all',
    rows: []
  };
  const statusNames = { pending: 'Menunggu', accepted: 'Diterima', rejected: 'Ditolak' };
  const fmtDate = (raw) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw || '') : date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  function answerText(raw) {
    if (raw === undefined || raw === null || raw === '')
      return '';
    if (Array.isArray(raw))
      return raw.map(answerText).filter(Boolean).join('; ');
    if (typeof raw === 'string') {
      return raw.startsWith('__SSC_OTHER__:') ? 'Jawaban lainnya: ' + raw.slice(14) : raw;
    }
    if (typeof raw === 'object') {
      if (raw.filename)
        return 'Gambar: ' + raw.filename;
      return state.valueText(raw);
    }
    return String(raw);
  }
  function columns() {
    return [
      { id: 'number', name: 'No.' },
      { id: 'username', name: 'Username Minecraft' },
      { id: 'date', name: 'Tanggal daftar' },
      { id: 'status', name: 'Status' },
      { id: 'code', name: 'Kode pendaftaran' },
      { id: 'reason', name: 'Alasan penolakan' },
      ...state.questions.map(([id, name]) => ({ id, name }))
    ];
  }
  function field(row, id, index) {
    if (id === 'number')
      return index + 1;
    if (id === 'username')
      return state.applicantName(row);
    if (id === 'date')
      return fmtDate(row.at);
    if (id === 'status')
      return statusNames[row.status] || row.status;
    if (id === 'code')
      return row.trackingCode || row.id.slice(0, 8).toUpperCase();
    if (id === 'reason')
      return row.reason || '';
    return answerText(row.answers?.[id]);
  }
  function filtered() {
    const q = state.query, st = state.status;
    return [...state.data.submissions].sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id))).filter(sub => {
      if (st !== 'all' && sub.status !== st)
        return false;
      if (!q)
        return true;
      const values = [
        state.applicantName(sub),
        sub.trackingCode || '',
        sub.status,
        sub.reason || '',
        sub.at,
        ...Object.values(sub.answers || {}).map(answerText)
      ];
      return values.some(s => String(s).toLocaleLowerCase('id-ID').includes(q));
    });
  }
  function renderRows() {
    const all = state.rows = filtered(), headers = columns(), pages = Math.max(1, Math.ceil(all.length / PAGE_ROWS));
    state.page = Math.min(state.page, pages - 1);
    const head = $('fullsheet-head'), body = $('fullsheet-body');
    const hr = create('tr');
    for (const col of headers) {
      const th = create('th', col.name);
      th.scope = 'col';
      th.title = col.name;
      hr.append(th);
    }
    head.replaceChildren(hr);
    body.replaceChildren();
    const start = state.page * PAGE_ROWS, items = all.slice(start, start + PAGE_ROWS);
    for (let i = 0; i < items.length; i++) {
      const item = items[i], r = create('tr');
      r.tabIndex = 0;
      r.setAttribute('aria-label', 'Buka detail ' + state.applicantName(item));
      r.addEventListener('click', e => {
        if (e.target.closest('a'))
          return;
        state.showDetails(item);
      });
      r.addEventListener('keydown', e => {
        if (e.target !== r)
          return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.showDetails(item);
        }
      });
      for (const column of headers) {
        const value = field(item, column.id, start + i);
        const td = create('td', value || '—');
        td.title = String(value || '');
        if (column.id === 'number')
          td.textContent = String(start + i + 1);
        if (column.id === 'status') {
          td.replaceChildren(create('span', value, 'fullsheet-status-badge ' + item.status));
        }
        if (column.id === 'code')
          td.style.fontFamily = 'ui-monospace,monospace';
        if (![
          'number',
          'username',
          'date',
          'status',
          'code',
          'reason'
        ].includes(column.id)) {
          const raw = item.answers?.[column.id];
          if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.mediaId) {
            const link = create('a', 'Lihat gambar ↗');
            link.href = '/api/admin/media/' + encodeURIComponent(raw.mediaId);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            td.replaceChildren(link);
          }
        }
        r.append(td);
      }
      body.append(r);
    }
    $('fullsheet-empty').classList.toggle('hide', items.length > 0);
    $('fullsheet-count').textContent = `${all.length.toLocaleString('id-ID')} pendaftar · ${headers.length} kolom`;
    $('fullsheet-page-info').textContent = `Menampilkan ${all.length ? start + 1 : 0}–${Math.min(start + PAGE_ROWS, all.length)} dari ${all.length} pendaftar · Halaman ${state.page + 1}/${pages}`;
    $('fullsheet-prev').disabled = state.page === 0;
    $('fullsheet-next').disabled = state.page >= pages - 1;
    $('fullsheet-scroll').scrollTop = 0;
  }
  function render(data, questionPairs, valueText, applicantName, showDetails) {
    state.data = data;
    state.questions = questionPairs;
    state.valueText = valueText;
    state.applicantName = applicantName;
    state.showDetails = showDetails;
    renderRows();
  }
  function columnLetter(n) {
    let s = '';
    for (let v = n + 1; v > 0; v = Math.floor((v - 1) / 26))
      s = String.fromCharCode(65 + (v - 1) % 26) + s;
    return s;
  }
  function xml(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function createWorkbook(rows, cols) {
    const sheetRows = [cols.map(c => c.name), ...rows.map((record, i) => cols.map(c => field(record, c.id, i)))];
    const last = columnLetter(cols.length - 1), lastRow = sheetRows.length;
    const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sheet = header + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<dimension ref="A1:${last}${lastRow}"/>`
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" xSplit="2" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="17"/>'
      + '<cols>'
      + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 8 : i === 1 ? 24 : i < 6 ? 22 : 37}" customWidth="1"/>`).join('')
      + '</cols>'
      + '<sheetData>'
      + sheetRows.map((r, index) => `<row r="${index + 1}"${index === 0 ? ' ht="25" customHeight="1"' : ''}>`
        + r.map((v, i) => {
          const ref = columnLetter(i) + (index + 1);
          if (index > 0 && i === 0)
            return `<c r="${ref}"><v>${index}</v></c>`;
          const value = String(v ?? '').slice(0, 32767);
          return `<c r="${ref}" t="inlineStr"${index === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        }).join('')
        + '</row>').join('')
      + '</sheetData><autoFilter ref="A1:'
      + last
      + lastRow
      + '"/></worksheet>';
    const types = header
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    const rels = header
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const book = header
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pendaftar SSCircle" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const bookrels = header
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const styles = header
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFF6EFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF46315F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>';
    return zipFiles([
      ['[Content_Types].xml', types],
      ['_rels/.rels', rels],
      ['xl/workbook.xml', book],
      ['xl/_rels/workbook.xml.rels', bookrels],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', sheet]
    ]);
  }
  const encoder = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++)
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  function crc32(arr) {
    let crc = 0xffffffff;
    for (const b of arr)
      crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipFiles(files) {
    const parts = [], central = [];
    let offset = 0;
    const push16 = (v, n, x) => v.setUint16(n, x, true), push32 = (v, n, x) => v.setUint32(n, x, true);
    for (const [fileName, contents] of files) {
      const name = encoder.encode(fileName), payload = encoder.encode(contents), crc = crc32(payload);
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      push32(view, 0, 0x04034b50);
      push16(view, 4, 20);
      push16(view, 6, 0x800);
      push16(view, 8, 0);
      push32(view, 14, crc);
      push32(view, 18, payload.length);
      push32(view, 22, payload.length);
      push16(view, 26, name.length);
      local.set(name, 30);
      parts.push(local, payload);
      const directory = new Uint8Array(46 + name.length), dv = new DataView(directory.buffer);
      push32(dv, 0, 0x02014b50);
      push16(dv, 4, 20);
      push16(dv, 6, 20);
      push16(dv, 8, 0x800);
      push16(dv, 10, 0);
      push32(dv, 16, crc);
      push32(dv, 20, payload.length);
      push32(dv, 24, payload.length);
      push16(dv, 28, name.length);
      push32(dv, 42, offset);
      directory.set(name, 46);
      central.push(directory);
      offset += local.length + payload.length;
    }
    const end = new Uint8Array(22), v = new DataView(end.buffer);
    push32(v, 0, 0x06054b50);
    push16(v, 8, files.length);
    push16(v, 10, files.length);
    push32(v, 12, central.reduce((sum, x) => sum + x.length, 0));
    push32(v, 16, offset);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function downloadExcel() {
    if (!state.data)
      return;
    const btn = $('fullsheet-download');
    btn.disabled = true;
    btn.textContent = 'Menyiapkan Excel...';
    try {
      const cols = columns(), rows = state.data.submissions, blob = createWorkbook(rows, cols), url = URL.createObjectURL(blob), link = create('a');
      link.href = url;
      link.download = 'SSCircle-Server-Semua-Jawaban.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    catch (err) {
      SSCNotice.alert('Gagal membuat spreadsheet: ' + err.message);
    }
    finally {
      btn.disabled = false;
      btn.textContent = '↓ Unduh Excel (.xlsx)';
    }
  }
  $('fullsheet-search').addEventListener('input', e => {
    state.query = e.target.value.trim().toLocaleLowerCase('id-ID');
    state.page = 0;
    if (state.data)
      renderRows();
  });
  $('fullsheet-status').addEventListener('change', e => {
    state.status = e.target.value;
    state.page = 0;
    if (state.data)
      renderRows();
  });
  $('fullsheet-prev').addEventListener('click', () => {
    state.page = Math.max(0, state.page - 1);
    renderRows();
  });
  $('fullsheet-next').addEventListener('click', () => {
    state.page++;
    renderRows();
  });
  $('fullsheet-download').addEventListener('click', downloadExcel);
  $('fullsheet-refresh').addEventListener('click', () => {
    if (window.SSCRefreshSheet)
      void SSCRefreshSheet();
  });
  return { render, createWorkbook, columns };
})();
window.SSCSpreadsheet = SSCircleSheet;
