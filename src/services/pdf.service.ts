/**
 * Zero-dependency raw PDF builder.
 * Standard Type1 fonts (Helvetica) — no binary font data embedded.
 * Runs in microseconds, safe for CF Workers CPU limit.
 */

import { toBaseCurrency } from './transactions.service';

// ─── Primitives ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function fmtAmt(amount: number, currency: string): string {
  if (currency === 'KHR') return `${Math.round(Math.abs(amount)).toLocaleString()} KHR`;
  return `${Math.abs(amount).toFixed(2)} ${currency}`;
}

type RGB = [number, number, number];
const BLUE:  RGB = [0.18, 0.39, 0.75];
const WHITE: RGB = [1, 1, 1];
const GRAY:  RGB = [0.75, 0.75, 0.75];
const DARK:  RGB = [0.12, 0.12, 0.12];
const GREEN: RGB = [0.05, 0.5, 0.2];
const RED:   RGB = [0.7, 0.1, 0.1];
const MUTED: RGB = [0.5, 0.5, 0.5];

function c(rgb: RGB, stroke = false): string {
  return `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} ${stroke ? 'RG' : 'rg'}`;
}

// ─── Page stream builder ──────────────────────────────────────────────────────

class Page {
  private ops: string[] = [];

  rect(x: number, y: number, w: number, h: number, fill: RGB) {
    this.ops.push(`${c(fill)} ${x} ${y} ${w} ${h} re f`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, lw = 0.5) {
    this.ops.push(`${c(color, true)} ${lw} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  text(s: string, x: number, y: number, size: number, bold: boolean, color: RGB) {
    this.ops.push(`BT /${bold ? 'FB' : 'F1'} ${size} Tf ${c(color)} ${x} ${y} Td (${esc(s)}) Tj ET`);
  }

  stream(): string { return this.ops.join('\n'); }
}

// ─── Multi-page PDF serializer ────────────────────────────────────────────────

function buildPDF(pageList: Page[]): Uint8Array {
  const N = pageList.length;
  const TOTAL = 3 + 2 * N + 2;
  const pIds  = Array.from({ length: N }, (_, i) => 3 + i);
  const sIds  = Array.from({ length: N }, (_, i) => 3 + N + i);
  const fReg  = 3 + 2 * N;
  const fBold = 3 + 2 * N + 1;

  let pdf = '%PDF-1.4\n';
  const off = new Array(TOTAL).fill(0);

  const wo = (id: number, body: string) => {
    off[id] = pdf.length;
    pdf += `${id} 0 obj\n${body}\nendobj\n`;
  };

  wo(1, `<</Type /Catalog /Pages 2 0 R>>`);
  wo(2, `<</Type /Pages /Kids [${pIds.map(id => `${id} 0 R`).join(' ')}] /Count ${N}>>`);
  for (let i = 0; i < N; i++) {
    wo(pIds[i],
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources <</Font <</F1 ${fReg} 0 R /FB ${fBold} 0 R>>>> ` +
      `/Contents ${sIds[i]} 0 R>>`,
    );
  }
  for (let i = 0; i < N; i++) {
    const s = pageList[i].stream();
    off[sIds[i]] = pdf.length;
    pdf += `${sIds[i]} 0 obj\n<</Length ${s.length}>>\nstream\n${s}\nendstream\nendobj\n`;
  }
  wo(fReg,  `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica      /Encoding /WinAnsiEncoding>>`);
  wo(fBold, `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>`);

  const xrefOff = pdf.length;
  pdf += `xref\n0 ${TOTAL}\n`;
  pdf += `0000000000 65535 f\r\n`;
  for (let id = 1; id < TOTAL; id++) {
    pdf += `${String(off[id]).padStart(10, '0')} 00000 n\r\n`;
  }
  pdf += `trailer\n<</Size ${TOTAL} /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// ─── Report layout ────────────────────────────────────────────────────────────

export async function generateReportPDF(params: {
  title: string;
  dateRange: string;
  baseCurrency: string;
  exchangeRate: number;
  transactions: any[];
}): Promise<Uint8Array> {
  const { title, dateRange, baseCurrency, exchangeRate } = params;

  // Keep ORIGINAL amounts and currencies — don't convert per row
  const rows = params.transactions.map((t) => ({
    date: new Date(t.transactionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    type: t.type as string,
    category: esc((t.category?.name ?? 'Other').slice(0, 16)),
    amount: Number(t.amount),
    currency: String(t.currency),
    note: esc((t.note ?? '').slice(0, 32)),
  }));

  const income   = rows.filter((r) => r.type === 'income');
  const expenses = rows.filter((r) => r.type === 'expense');

  // Unique currencies across all transactions
  const currencies = [...new Set(rows.map((r) => r.currency))];

  // Per-currency subtotals
  const byCurrency = currencies.map((cur) => {
    const curInc = income.filter((r) => r.currency === cur).reduce((s, r) => s + r.amount, 0);
    const curExp = expenses.filter((r) => r.currency === cur).reduce((s, r) => s + r.amount, 0);
    return { cur, curInc, curExp, curNet: curInc - curExp };
  });

  // Grand totals converted to base currency
  const grandIncome   = income.reduce((s, r) => s + toBaseCurrency(r.amount, r.currency, baseCurrency, exchangeRate), 0);
  const grandExpenses = expenses.reduce((s, r) => s + toBaseCurrency(r.amount, r.currency, baseCurrency, exchangeRate), 0);
  const grandNet      = grandIncome - grandExpenses;
  const savings       = grandIncome > 0 ? ((grandNet / grandIncome) * 100).toFixed(1) : '0.0';

  const pages: Page[] = [];
  let pg = new Page();
  pages.push(pg);

  const L = 40, R = 555, W = 515;
  let y = 800;

  function checkSpace(need: number) {
    if (y - need < 50) { pg = new Page(); pages.push(pg); y = 800; }
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  pg.rect(L, y - 48, W, 48, BLUE);
  pg.text('ChhayLuy Report Bot', L + 10, y - 18, 13, true,  WHITE);
  pg.text(title,                  L + 10, y - 34, 10, false, WHITE);
  pg.text(dateRange,              R - 185, y - 18, 8,  false, [0.8, 0.9, 1]);
  pg.text(`Base: ${baseCurrency}  1 USD = ${Math.round(exchangeRate).toLocaleString()} KHR`,
    R - 185, y - 32, 7.5, false, [0.8, 0.9, 1]);
  y -= 62;

  // ── Section renderer (rows show ORIGINAL price) ───────────────────────────
  function drawSection(label: string, txRows: typeof rows, isExpense: boolean) {
    const accent: RGB = isExpense ? RED : GREEN;
    checkSpace(48);
    pg.line(L, y, R, y, accent, 1.2);
    y -= 16;
    pg.text(`${label}  (${txRows.length} items)`, L, y, 10, true, accent);
    y -= 18;

    if (txRows.length === 0) {
      pg.text('No transactions.', L + 8, y, 9, false, MUTED);
      y -= 20;
      return;
    }

    pg.text('Date',     L,       y, 8, true, MUTED);
    pg.text('Category', L + 58,  y, 8, true, MUTED);
    pg.text('Amount',   L + 162, y, 8, true, MUTED);
    pg.text('Note',     L + 258, y, 8, true, MUTED);
    y -= 4;
    pg.line(L, y, R, y, GRAY, 0.4);
    y -= 14;

    for (const r of txRows) {
      checkSpace(15);
      pg.text(r.date,                   L,       y, 8.5, false, DARK);
      pg.text(r.category,               L + 58,  y, 8.5, false, DARK);
      pg.text(fmtAmt(r.amount, r.currency), L + 162, y, 8.5, false, accent);
      if (r.note) pg.text(r.note,       L + 258, y, 8.5, false, MUTED);
      y -= 15;
    }
    y -= 6;
  }

  drawSection('INCOME', income, false);
  drawSection('EXPENSES', expenses, true);

  // ── Summary ───────────────────────────────────────────────────────────────
  checkSpace(30 + byCurrency.length * 52 + 80);

  pg.line(L, y, R, y, BLUE, 1.2);
  y -= 16;
  pg.text('SUMMARY BY CURRENCY', L, y, 10, true, BLUE);
  y -= 18;

  // Per-currency rows
  for (const { cur, curInc, curExp, curNet } of byCurrency) {
    if (curInc === 0 && curExp === 0) continue;
    checkSpace(52);
    pg.text(`${cur}`, L, y, 9, true, DARK);
    y -= 15;
    if (curInc > 0) {
      pg.text('Income:',   L + 12, y, 8.5, false, MUTED);
      pg.text(fmtAmt(curInc, cur), L + 72, y, 8.5, false, GREEN);
      y -= 14;
    }
    if (curExp > 0) {
      pg.text('Expenses:', L + 12, y, 8.5, false, MUTED);
      pg.text(fmtAmt(curExp, cur), L + 72, y, 8.5, false, RED);
      y -= 14;
    }
    pg.text('Net:',      L + 12, y, 8.5, false, MUTED);
    pg.text(fmtAmt(curNet, cur), L + 72, y, 8.5, false, curNet >= 0 ? GREEN : RED);
    y -= 18;
  }

  // Grand total in base currency
  if (currencies.length > 0) {
    checkSpace(68);
    y -= 4;
    pg.line(L, y, R, y, GRAY, 0.4);
    y -= 14;
    pg.text(`TOTAL IN ${baseCurrency}  (rate: 1 USD = ${Math.round(exchangeRate).toLocaleString()} KHR)`,
      L, y, 9, true, BLUE);
    y -= 16;

    const totRows = [
      { label: 'Total Income',   val: fmtAmt(grandIncome,   baseCurrency), color: GREEN },
      { label: 'Total Expenses', val: fmtAmt(grandExpenses, baseCurrency), color: RED },
      { label: 'Net Balance',    val: fmtAmt(grandNet,      baseCurrency), color: grandNet >= 0 ? GREEN : RED },
      { label: 'Savings Rate',   val: `${savings}%`,                        color: DARK },
    ] as const;

    for (const s of totRows) {
      pg.text(s.label, L,       y, 9.5, true,  DARK);
      pg.text(s.val,   L + 210, y, 9.5, true,  s.color as RGB);
      y -= 17;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = pages.length;
  pages.forEach((p, i) => {
    p.line(L, 30, R, 30, GRAY, 0.5);
    p.text(`ChhayLuy Report Bot  |  ${title}  |  Page ${i + 1} of ${totalPages}`, L, 16, 7.5, false, MUTED);
  });

  return buildPDF(pages);
}
