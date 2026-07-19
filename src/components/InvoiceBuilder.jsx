// ============================================================
// InvoiceBuilder — Lloyds Pro Sound clickable invoice
// ============================================================
// A single-screen tool: every line item from Lloyd's quotation is a
// toggleable, editable row. Untick what the event doesn't need, tweak
// quantities/rates inline, and the subtotal + GST + grand total recompute
// live. Print (native → PDF) or Download PDF ships a clean white invoice.
//
// Work-in-progress is auto-saved to localStorage so a refresh never loses
// a half-built invoice. "Reset to template" restores the seeded A26 set.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMPANY,
  TAX,
  DEFAULT_META,
  DEFAULT_NOTES,
  SECTIONS,
} from '../lib/invoiceData.js';

const STORAGE_KEY = 'lloyds-invoice-draft-v1';

// ---- helpers -------------------------------------------------
const inr = (n) =>
  '₹' +
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

// Seed the editable model: every item gets include:true; sections/groups
// keep their shape so we can render headers and sub-totals.
function buildInitialState() {
  return SECTIONS.map((sec) => ({
    ...sec,
    groups: sec.groups.map((g) => ({
      ...g,
      items: g.items.map((it) => ({ ...it, include: true })),
    })),
  }));
}

function loadDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function InvoiceBuilder() {
  const draft = typeof window !== 'undefined' ? loadDraft() : null;

  const [meta, setMeta] = useState(draft?.meta || DEFAULT_META);
  const [sections, setSections] = useState(draft?.sections || buildInitialState());
  const [notes, setNotes] = useState(draft?.notes || DEFAULT_NOTES);
  const [tax, setTax] = useState(draft?.tax || TAX);
  const [hideExcluded, setHideExcluded] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(null);

  // Auto-save the whole draft on any change.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ meta, sections, notes, tax })
      );
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [meta, sections, notes, tax]);

  // ---- mutations --------------------------------------------
  const updateItem = (secId, groupId, itemId, patch) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: sec.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : {
                      ...g,
                      items: g.items.map((it) =>
                        it.id === itemId ? { ...it, ...patch } : it
                      ),
                    }
              ),
            }
      )
    );
  };

  const toggleGroup = (secId, groupId, include) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: sec.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, items: g.items.map((it) => ({ ...it, include })) }
              ),
            }
      )
    );
  };

  const resetAll = () => {
    if (!window.confirm('Reset everything back to the A26 template? Your current changes will be lost.'))
      return;
    setMeta(DEFAULT_META);
    setSections(buildInitialState());
    setNotes(DEFAULT_NOTES);
    setTax(TAX);
  };

  // ---- totals -----------------------------------------------
  const { subtotal, cgst, sgst, grand, itemCount } = useMemo(() => {
    let sub = 0;
    let count = 0;
    for (const sec of sections)
      for (const g of sec.groups)
        for (const it of g.items)
          if (it.include) {
            sub += (Number(it.qty) || 0) * (Number(it.rate) || 0);
            count += 1;
          }
    const c = (sub * (Number(tax.cgstRate) || 0)) / 100;
    const s = (sub * (Number(tax.sgstRate) || 0)) / 100;
    return { subtotal: sub, cgst: c, sgst: s, grand: sub + c + s, itemCount: count };
  }, [sections, tax]);

  const groupTotal = (g) =>
    g.items.reduce(
      (t, it) => t + (it.include ? (Number(it.qty) || 0) * (Number(it.rate) || 0) : 0),
      0
    );

  // ---- export -----------------------------------------------
  const doPrint = () => window.print();

  const doDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      document.body.classList.add('invoice-exporting');
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      document.body.classList.remove('invoice-exporting');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      const img = canvas.toDataURL('image/jpeg', 0.95);

      pdf.addImage(img, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      const safeClient = (meta.client || 'invoice').replace(/[^\w-]+/g, '_');
      pdf.save(`Lloyds_Invoice_${safeClient}.pdf`);
    } catch (e) {
      alert('Sorry — PDF export failed. Use the Print button and "Save as PDF" instead.');
      document.body.classList.remove('invoice-exporting');
    } finally {
      setBusy(false);
    }
  };

  // ---- render helpers ---------------------------------------
  const metaField = (key, placeholder) => (
    <input
      className="iv-meta-input"
      value={meta[key] || ''}
      placeholder={placeholder}
      onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
    />
  );

  return (
    <div className="iv-root">
      {/* ── Toolbar (screen only) ─────────────────────────── */}
      <div className="iv-toolbar no-print">
        <div className="iv-toolbar-brand">
          <span className="iv-toolbar-logo">LLOYDS</span>
          <span className="iv-toolbar-sub">Invoice Builder</span>
        </div>
        <div className="iv-toolbar-actions">
          <label className="iv-check-inline">
            <input
              type="checkbox"
              checked={hideExcluded}
              onChange={(e) => setHideExcluded(e.target.checked)}
            />
            Hide unticked
          </label>
          <button className="iv-btn iv-btn-ghost" onClick={resetAll}>
            Reset
          </button>
          <button className="iv-btn iv-btn-ghost" onClick={doDownloadPdf} disabled={busy}>
            {busy ? 'Working…' : 'Download PDF'}
          </button>
          <button className="iv-btn iv-btn-gold" onClick={doPrint}>
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* ── The invoice sheet ─────────────────────────────── */}
      <div className="iv-sheet" ref={sheetRef}>
        {/* Header */}
        <header className="iv-head">
          <div className="iv-head-left">
            <div className="iv-logo">LLOYDS<span>PRO SOUND</span></div>
            <p className="iv-company-line">{COMPANY.address}</p>
            <p className="iv-company-line">
              Phone: {COMPANY.phone} &nbsp;·&nbsp; {COMPANY.email}
            </p>
            <p className="iv-company-line">{COMPANY.website}</p>
          </div>
          <div className="iv-head-right">
            <div className="iv-doc-title">Quotation</div>
            <div className="iv-doc-meta">
              <label>Invoice No.</label>
              {metaField('invoiceNo', '—')}
            </div>
            <div className="iv-doc-meta">
              <label>Date</label>
              {metaField('invoiceDate', '—')}
            </div>
          </div>
        </header>

        {/* Bill-to / event grid */}
        <section className="iv-billto">
          <div className="iv-billto-col">
            <span className="iv-billto-label">Bill To</span>
            {metaField('client', 'Client name')}
            <div className="iv-billto-title">
              {metaField('title', 'Event / package title')}
            </div>
          </div>
          <div className="iv-billto-grid">
            <div>
              <span className="iv-billto-label">Event Date</span>
              {metaField('eventDate', 'Event date')}
            </div>
            <div>
              <span className="iv-billto-label">Set-up Date</span>
              {metaField('setupDate', 'Set-up date')}
            </div>
            <div className="iv-billto-venue">
              <span className="iv-billto-label">Venue</span>
              {metaField('venue', 'Venue')}
            </div>
          </div>
        </section>

        {/* Sections */}
        {sections.map((sec) => {
          const secTotal = sec.groups.reduce((t, g) => t + groupTotal(g), 0);
          return (
            <section className="iv-section" key={sec.id}>
              <div className="iv-section-head">
                <h3>{sec.title}</h3>
                <span className="iv-section-total">{inr(secTotal)}</span>
              </div>

              {sec.groups.map((g) => {
                const allOn = g.items.every((it) => it.include);
                return (
                  <div className="iv-group" key={g.id}>
                    {g.name && (
                      <div className="iv-group-head">
                        <label className="iv-group-toggle no-print">
                          <input
                            type="checkbox"
                            checked={allOn}
                            onChange={(e) => toggleGroup(sec.id, g.id, e.target.checked)}
                          />
                        </label>
                        <span className="iv-group-name">{g.name}</span>
                      </div>
                    )}

                    <table className="iv-table">
                      <thead>
                        <tr>
                          <th className="iv-col-chk no-print"></th>
                          <th className="iv-col-desc">Item</th>
                          <th className="iv-col-qty">Qty</th>
                          <th className="iv-col-rate">Rate / Day</th>
                          <th className="iv-col-amt">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => {
                          const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                          const off = !it.include;
                          if (off && hideExcluded) return null;
                          return (
                            <tr
                              key={it.id}
                              className={`iv-row ${off ? 'iv-row-off' : ''}`}
                            >
                              <td className="iv-col-chk no-print">
                                <input
                                  type="checkbox"
                                  checked={it.include}
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, {
                                      include: e.target.checked,
                                    })
                                  }
                                />
                              </td>
                              <td className="iv-col-desc">
                                <input
                                  className="iv-cell-input"
                                  value={it.desc}
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, {
                                      desc: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td className="iv-col-qty">
                                <input
                                  className="iv-cell-input iv-num"
                                  type="number"
                                  min="0"
                                  value={it.qty}
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, {
                                      qty: e.target.value === '' ? '' : Number(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td className="iv-col-rate">
                                <input
                                  className="iv-cell-input iv-num"
                                  type="number"
                                  min="0"
                                  value={it.rate}
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, {
                                      rate: e.target.value === '' ? '' : Number(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td className="iv-col-amt">{inr(amt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          );
        })}

        {/* Totals */}
        <section className="iv-totals">
          <div className="iv-totals-box">
            <div className="iv-totals-row">
              <span>Subtotal</span>
              <span>{inr(subtotal)}</span>
            </div>
            <div className="iv-totals-row">
              <span>
                CGST @{' '}
                <input
                  className="iv-tax-input no-print-border"
                  type="number"
                  value={tax.cgstRate}
                  onChange={(e) => setTax({ ...tax, cgstRate: Number(e.target.value) })}
                />
                %
              </span>
              <span>{inr(cgst)}</span>
            </div>
            <div className="iv-totals-row">
              <span>
                SGST @{' '}
                <input
                  className="iv-tax-input no-print-border"
                  type="number"
                  value={tax.sgstRate}
                  onChange={(e) => setTax({ ...tax, sgstRate: Number(e.target.value) })}
                />
                %
              </span>
              <span>{inr(sgst)}</span>
            </div>
            <div className="iv-totals-row iv-grand">
              <span>Grand Total</span>
              <span>{inr(grand)}</span>
            </div>
            <div className="iv-totals-meta no-print">
              {itemCount} item{itemCount === 1 ? '' : 's'} included
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="iv-notes">
          <h4>Kindly Note</h4>
          <ol>
            {notes.map((n, i) => (
              <li key={i}>
                <textarea
                  className="iv-note-input"
                  value={n}
                  rows={1}
                  onChange={(e) => {
                    const next = [...notes];
                    next[i] = e.target.value;
                    setNotes(next);
                  }}
                />
              </li>
            ))}
          </ol>
        </section>

        <footer className="iv-foot">
          <span>Thank you for your business.</span>
          <span>{COMPANY.name} · {COMPANY.phone}</span>
        </footer>
      </div>
    </div>
  );
}
