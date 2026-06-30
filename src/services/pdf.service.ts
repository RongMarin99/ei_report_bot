import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fmtAmount, toBaseCurrency } from './transactions.service';

const C = {
  blue:      rgb(0.18, 0.39, 0.75),
  white:     rgb(1, 1, 1),
  lightGray: rgb(0.96, 0.96, 0.96),
  midGray:   rgb(0.82, 0.82, 0.82),
  darkText:  rgb(0.12, 0.12, 0.12),
  green:     rgb(0.05, 0.5, 0.2),
  red:       rgb(0.7, 0.1, 0.1),
  muted:     rgb(0.5, 0.5, 0.5),
};

interface TxRow {
  date: string;
  type: string;
  category: string;
  amount: number;
  currency: string;
  note: string;
}

export async function generateReportPDF(params: {
  title: string;
  dateRange: string;
  baseCurrency: string;
  exchangeRate: number;
  transactions: any[];
}): Promise<Uint8Array> {
  const { title, dateRange, baseCurrency, exchangeRate } = params;

  const rows: TxRow[] = params.transactions.map((t) => ({
    date: new Date(t.transactionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    type: t.type,
    category: (t as any).category?.name ?? 'Other',
    amount: toBaseCurrency(t.amount, t.currency, baseCurrency, exchangeRate),
    currency: baseCurrency,
    note: (t.note ?? '').slice(0, 40),
  }));

  const incomeRows = rows.filter((r) => r.type === 'income');
  const expenseRows = rows.filter((r) => r.type === 'expense');
  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);
  const net = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : '0.0';

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595, H = 842, M = 40;
  const INNER = W - M * 2;

  let page = pdfDoc.addPage([W, H]);
  let y = H - M;

  function addPage() {
    page = pdfDoc.addPage([W, H]);
    y = H - M;
  }

  function ensureSpace(needed: number) {
    if (y - needed < M + 30) addPage();
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y: y - 48, width: INNER, height: 48, color: C.blue });
  page.drawText('EI BOT', { x: M + 12, y: y - 18, size: 18, font: bold, color: C.white });
  page.drawText(title, { x: M + 80, y: y - 18, size: 14, font: bold, color: C.white });
  page.drawText(dateRange, { x: M + 12, y: y - 36, size: 9, font, color: rgb(0.8, 0.9, 1) });
  const rateText = `Base: ${baseCurrency}  |  1 USD = ${Math.round(exchangeRate).toLocaleString()} KHR`;
  page.drawText(rateText, { x: M + 300, y: y - 36, size: 9, font, color: rgb(0.8, 0.9, 1) });
  y -= 65;

  // ── Section renderer ───────────────────────────────────────────────────────
  function drawSection(label: string, sectionRows: TxRow[], total: number, isExpense: boolean) {
    ensureSpace(60);

    // Section header
    page.drawRectangle({ x: M, y: y - 22, width: INNER, height: 22, color: isExpense ? rgb(0.97, 0.93, 0.93) : rgb(0.93, 0.97, 0.93) });
    const icon = isExpense ? 'EXPENSES' : 'INCOME';
    page.drawText(`${icon}  (${sectionRows.length} transactions)`, {
      x: M + 10, y: y - 16, size: 10, font: bold,
      color: isExpense ? C.red : C.green,
    });
    y -= 28;

    if (sectionRows.length === 0) {
      page.drawText('No transactions', { x: M + 10, y: y - 12, size: 9, font, color: C.muted });
      y -= 25;
      return;
    }

    // Column headers
    const cols = [
      { label: 'Date',     x: M,          w: 55 },
      { label: 'Category', x: M + 58,     w: 100 },
      { label: 'Amount',   x: M + 162,    w: 95 },
      { label: 'Note',     x: M + 260,    w: INNER - 220 },
    ];

    page.drawRectangle({ x: M, y: y - 18, width: INNER, height: 18, color: C.lightGray });
    cols.forEach((c) => {
      page.drawText(c.label, { x: c.x + 4, y: y - 13, size: 8, font: bold, color: C.muted });
    });
    y -= 22;

    // Rows
    sectionRows.forEach((r, i) => {
      ensureSpace(18);
      if (i % 2 === 1) {
        page.drawRectangle({ x: M, y: y - 15, width: INNER, height: 15, color: C.lightGray });
      }
      page.drawText(r.date,     { x: cols[0].x + 4, y: y - 11, size: 8.5, font, color: C.darkText });
      page.drawText(r.category, { x: cols[1].x + 4, y: y - 11, size: 8.5, font, color: C.darkText });
      page.drawText(fmtAmountPDF(r.amount, r.currency), { x: cols[2].x + 4, y: y - 11, size: 8.5, font, color: isExpense ? C.red : C.green });
      page.drawText(r.note,     { x: cols[3].x + 4, y: y - 11, size: 8.5, font, color: C.muted });
      y -= 16;
    });

    // Totals row
    ensureSpace(20);
    page.drawRectangle({ x: M, y: y - 18, width: INNER, height: 18, color: isExpense ? rgb(0.97, 0.93, 0.93) : rgb(0.93, 0.97, 0.93) });
    page.drawText('TOTAL', { x: M + 10, y: y - 13, size: 9, font: bold, color: C.darkText });
    page.drawText(fmtAmountPDF(total, baseCurrency), { x: M + 162 + 4, y: y - 13, size: 9, font: bold, color: isExpense ? C.red : C.green });
    y -= 25;
  }

  drawSection('INCOME', incomeRows, totalIncome, false);
  y -= 8;
  drawSection('EXPENSES', expenseRows, totalExpenses, true);
  y -= 12;

  // ── Summary ────────────────────────────────────────────────────────────────
  ensureSpace(100);
  page.drawRectangle({ x: M, y: y - 22, width: INNER, height: 22, color: C.blue });
  page.drawText('SUMMARY', { x: M + 10, y: y - 16, size: 10, font: bold, color: C.white });
  y -= 28;

  const summaryRows = [
    { label: 'Total Income',    value: fmtAmountPDF(totalIncome, baseCurrency),  color: C.green },
    { label: 'Total Expenses',  value: fmtAmountPDF(totalExpenses, baseCurrency), color: C.red },
    { label: 'Net Balance',     value: fmtAmountPDF(net, baseCurrency),           color: net >= 0 ? C.green : C.red },
    { label: 'Savings Rate',    value: `${savingsRate}%`,                          color: C.darkText },
  ];

  summaryRows.forEach((row, i) => {
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 15, width: INNER, height: 15, color: C.lightGray });
    page.drawText(row.label, { x: M + 10, y: y - 11, size: 10, font: bold, color: C.darkText });
    page.drawText(row.value, { x: M + 250, y: y - 11, size: 10, font: bold, color: row.color });
    y -= 18;
  });

  // Footer
  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = pdfDoc.getPage(i);
    p.drawText(`EI Bot Report  |  Page ${i + 1} of ${pageCount}`, {
      x: M, y: 20, size: 8, font, color: C.muted,
    });
    p.drawLine({ start: { x: M, y: 30 }, end: { x: W - M, y: 30 }, thickness: 0.5, color: C.midGray });
  }

  return pdfDoc.save();
}

function fmtAmountPDF(amount: number, currency: string): string {
  if (currency === 'KHR') return `${Math.round(amount).toLocaleString()} KHR`;
  return `${Math.abs(amount).toFixed(2)} ${currency}`;
}
