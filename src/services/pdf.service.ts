import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fmtAmount, toBaseCurrency } from './transactions.service';

const C = {
  blue:  rgb(0.18, 0.39, 0.75),
  white: rgb(1, 1, 1),
  gray:  rgb(0.82, 0.82, 0.82),
  dark:  rgb(0.12, 0.12, 0.12),
  green: rgb(0.05, 0.5, 0.2),
  red:   rgb(0.7, 0.1, 0.1),
  muted: rgb(0.5, 0.5, 0.5),
};

export async function generateReportPDF(params: {
  title: string;
  dateRange: string;
  baseCurrency: string;
  exchangeRate: number;
  transactions: any[];
}): Promise<Uint8Array> {
  const { title, dateRange, baseCurrency, exchangeRate } = params;

  // Embed fonts once (standard fonts = no binary embed = fast)
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const rows = params.transactions.map((t) => ({
    date: new Date(t.transactionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    type: t.type as string,
    category: (t.category?.name ?? 'Other').slice(0, 18),
    amount: toBaseCurrency(t.amount, t.currency, baseCurrency, exchangeRate),
    note: (t.note ?? '').slice(0, 35),
  }));

  const income   = rows.filter((r) => r.type === 'income');
  const expenses = rows.filter((r) => r.type === 'expense');
  const totalIn  = income.reduce((s, r) => s + r.amount, 0);
  const totalEx  = expenses.reduce((s, r) => s + r.amount, 0);
  const net      = totalIn - totalEx;
  const savings  = totalIn > 0 ? ((net / totalIn) * 100).toFixed(1) : '0.0';

  const W = 595, H = 842, L = 40, R = W - 40;
  const pages: ReturnType<typeof doc.addPage>[] = [];

  function newPage() {
    const p = doc.addPage([W, H]);
    pages.push(p);
    return p;
  }

  let page = newPage();
  let y = H - 40;

  function checkSpace(need: number) {
    if (y - need < 50) { page = newPage(); y = H - 40; }
  }

  // ── Header bar ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: L, y: y - 50, width: R - L, height: 50, color: C.blue });
  page.drawText('EI BOT REPORT', { x: L + 10, y: y - 20, size: 14, font: bold, color: C.white });
  page.drawText(title,           { x: L + 10, y: y - 36, size: 10, font,       color: C.white });
  page.drawText(dateRange,       { x: R - 200, y: y - 20, size: 8,  font,      color: rgb(0.8, 0.9, 1) });
  page.drawText(`Rate: 1 USD = ${Math.round(exchangeRate).toLocaleString()} KHR  |  Base: ${baseCurrency}`,
    { x: R - 200, y: y - 34, size: 8, font, color: rgb(0.8, 0.9, 1) });
  y -= 62;

  // ── Section ───────────────────────────────────────────────────────────────
  function drawSection(label: string, txRows: typeof rows, total: number, isExpense: boolean) {
    checkSpace(50);
    const accent = isExpense ? C.red : C.green;

    // Section title line
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: accent });
    y -= 16;
    page.drawText(`${label}  (${txRows.length} items)`, { x: L, y, size: 10, font: bold, color: accent });
    y -= 18;

    if (txRows.length === 0) {
      page.drawText('No transactions.', { x: L + 8, y, size: 9, font, color: C.muted });
      y -= 20;
      return;
    }

    // Column headers
    page.drawText('Date',     { x: L,       y, size: 8, font: bold, color: C.muted });
    page.drawText('Category', { x: L + 58,  y, size: 8, font: bold, color: C.muted });
    page.drawText('Amount',   { x: L + 160, y, size: 8, font: bold, color: C.muted });
    page.drawText('Note',     { x: L + 255, y, size: 8, font: bold, color: C.muted });
    y -= 4;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: C.gray });
    y -= 14;

    for (const r of txRows) {
      checkSpace(16);
      const amtStr = baseCurrency === 'KHR'
        ? `${Math.round(r.amount).toLocaleString()} KHR`
        : `${r.amount.toFixed(2)} ${baseCurrency}`;

      page.drawText(r.date,     { x: L,       y, size: 8.5, font, color: C.dark });
      page.drawText(r.category, { x: L + 58,  y, size: 8.5, font, color: C.dark });
      page.drawText(amtStr,     { x: L + 160, y, size: 8.5, font, color: accent });
      page.drawText(r.note,     { x: L + 255, y, size: 8.5, font, color: C.muted });
      y -= 15;
    }

    // Total row
    checkSpace(20);
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.4, color: C.gray });
    y -= 14;
    const totStr = baseCurrency === 'KHR'
      ? `${Math.round(total).toLocaleString()} KHR`
      : `${total.toFixed(2)} ${baseCurrency}`;
    page.drawText('TOTAL', { x: L, y, size: 9, font: bold, color: C.dark });
    page.drawText(totStr,  { x: L + 160, y, size: 9, font: bold, color: accent });
    y -= 22;
  }

  drawSection('INCOME', income, totalIn, false);
  y -= 6;
  drawSection('EXPENSES', expenses, totalEx, true);
  y -= 12;

  // ── Summary ───────────────────────────────────────────────────────────────
  checkSpace(80);
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: C.blue });
  y -= 16;
  page.drawText('SUMMARY', { x: L, y, size: 10, font: bold, color: C.blue });
  y -= 18;

  const fmt = (n: number) => baseCurrency === 'KHR'
    ? `${Math.round(n).toLocaleString()} KHR`
    : `${n.toFixed(2)} ${baseCurrency}`;

  const sumRows = [
    { label: 'Total Income',   val: fmt(totalIn),  color: C.green },
    { label: 'Total Expenses', val: fmt(totalEx),  color: C.red },
    { label: 'Net Balance',    val: fmt(net),       color: net >= 0 ? C.green : C.red },
    { label: 'Savings Rate',   val: `${savings}%`, color: C.dark },
  ];

  for (const s of sumRows) {
    page.drawText(s.label, { x: L,       y, size: 10, font: bold, color: C.dark });
    page.drawText(s.val,   { x: L + 220, y, size: 10, font: bold, color: s.color });
    y -= 18;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const total = doc.getPageCount();
  for (let i = 0; i < total; i++) {
    const p = doc.getPage(i);
    p.drawLine({ start: { x: L, y: 30 }, end: { x: R, y: 30 }, thickness: 0.5, color: C.gray });
    p.drawText(`EI Bot  |  ${title}  |  Page ${i + 1} of ${total}`,
      { x: L, y: 18, size: 7.5, font, color: C.muted });
  }

  return doc.save();
}
