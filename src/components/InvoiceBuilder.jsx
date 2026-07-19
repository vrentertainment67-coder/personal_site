// ============================================================
// InvoiceBuilder — Lloyds Pro Sound clickable invoice
// ============================================================
// Every line item from a quotation is a toggleable, editable row.
// Untick what an event doesn't need, tweak qty/rate inline, and the
// subtotal + GST + grand total recompute live. Print (native → PDF) or
// Download PDF ships a clean white document.
//
// Reusable tool:
//   • Add / remove line items, sub-groups (band members) and whole
//     sections — build any event off the A26 master catalogue.
//   • Save, load, duplicate and delete multiple named invoices
//     (stored in the browser via localStorage).
//   • Upload the Lloyds Pro Sound logo (stored with the invoice).
// A working draft auto-saves so a refresh never loses in-progress edits.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_COMPANY,
  DEFAULT_DOC_TYPE,
  DEFAULT_FOOTER,
  TAX,
  DEFAULT_META,
  DEFAULT_NOTES,
  SECTIONS,
} from '../lib/invoiceData.js';

const DRAFT_KEY = 'lloyds-invoice-draft-v1';   // in-progress working copy
const LIB_KEY = 'lloyds-invoices-v1';          // saved, named invoices
const LOGO_KEY = 'lloyds-invoice-logo-v1';     // company logo (shared across invoices)
const COMPANY_KEY = 'lloyds-invoice-company-v1'; // company header defaults

// ---- helpers -------------------------------------------------
const inr = (n) =>
  '₹' +
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const uid = (p = 'x') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// Seed the editable model: every item gets include:true.
function buildInitialSections() {
  return SECTIONS.map((sec) => ({
    ...sec,
    groups: sec.groups.map((g) => ({
      ...g,
      items: g.items.map((it) => ({ ...it, include: true })),
    })),
  }));
}

function readJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function InvoiceBuilder() {
  const draft = typeof window !== 'undefined' ? readJSON(DRAFT_KEY, null) : null;

  const [meta, setMeta] = useState(draft?.meta || DEFAULT_META);
  const [sections, setSections] = useState(draft?.sections || buildInitialSections());
  const [notes, setNotes] = useState(draft?.notes || DEFAULT_NOTES);
  const [tax, setTax] = useState(draft?.tax || TAX);
  const [company, setCompany] = useState(
    draft?.company ||
      (typeof window !== 'undefined' ? readJSON(COMPANY_KEY, null) : null) ||
      DEFAULT_COMPANY
  );
  const [docType, setDocType] = useState(draft?.docType || DEFAULT_DOC_TYPE);
  const [footer, setFooter] = useState(draft?.footer || DEFAULT_FOOTER);
  const [logo, setLogo] = useState(
    (typeof window !== 'undefined' && readJSON(DRAFT_KEY, null)?.logo) ||
      (typeof window !== 'undefined' ? window.localStorage.getItem(LOGO_KEY) : null) ||
      null
  );

  const [library, setLibrary] = useState(() => readJSON(LIB_KEY, []));
  const [activeId, setActiveId] = useState(draft?.activeId || null);
  const [activeName, setActiveName] = useState(draft?.activeName || '');
  const [dirty, setDirty] = useState(false);

  const [hideExcluded, setHideExcluded] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(null);
  const skipDirty = useRef(true); // don't flag a fresh load as "unsaved"

  // Auto-save the working draft + track unsaved edits.
  useEffect(() => {
    if (skipDirty.current) {
      skipDirty.current = false;
    } else {
      setDirty(true);
    }
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ meta, sections, notes, tax, logo, company, docType, footer, activeId, activeName })
      );
      if (logo) window.localStorage.setItem(LOGO_KEY, logo);
      // Remember the latest company header so new invoices inherit it.
      window.localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
    } catch {
      /* storage full / disabled — non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sections, notes, tax, logo, company, docType, footer]);

  const persistLibrary = (lib) => {
    setLibrary(lib);
    try {
      window.localStorage.setItem(LIB_KEY, JSON.stringify(lib));
    } catch {
      /* non-fatal */
    }
  };

  const loadInto = (data, id, name) => {
    skipDirty.current = true;
    setMeta(data.meta);
    setSections(data.sections);
    setNotes(data.notes);
    setTax(data.tax);
    if (data.logo !== undefined) setLogo(data.logo);
    if (data.company) setCompany(data.company);
    if (data.docType) setDocType(data.docType);
    if (data.footer) setFooter(data.footer);
    setActiveId(id);
    setActiveName(name || '');
    setDirty(false);
  };

  // ---- saved-invoice manager --------------------------------
  const snapshot = () => ({
    meta,
    sections,
    notes,
    tax,
    logo,
    company,
    docType,
    footer,
  });

  const saveInvoice = () => {
    let name = activeName;
    let id = activeId;
    if (!id) {
      const suggested = meta.title || meta.client || 'Untitled invoice';
      name = window.prompt('Save invoice as:', suggested);
      if (name === null) return; // cancelled
      name = name.trim() || suggested;
      id = uid('inv');
    }
    const entry = { id, name, updatedAt: Date.now(), data: snapshot() };
    const exists = library.some((e) => e.id === id);
    const next = exists
      ? library.map((e) => (e.id === id ? entry : e))
      : [...library, entry];
    persistLibrary(next);
    setActiveId(id);
    setActiveName(name);
    setDirty(false);
  };

  const saveAsNew = () => {
    const suggested = (activeName ? activeName + ' (copy)' : meta.title || 'Untitled invoice');
    const name = window.prompt('Save a copy as:', suggested);
    if (name === null) return;
    const id = uid('inv');
    const entry = { id, name: name.trim() || suggested, updatedAt: Date.now(), data: snapshot() };
    persistLibrary([...library, entry]);
    setActiveId(id);
    setActiveName(entry.name);
    setDirty(false);
  };

  const loadInvoice = (id) => {
    if (!id) return;
    if (dirty && !window.confirm('Discard unsaved changes and load this invoice?')) return;
    const entry = library.find((e) => e.id === id);
    if (entry) loadInto(entry.data, entry.id, entry.name);
  };

  const deleteInvoice = () => {
    if (!activeId) return;
    if (!window.confirm(`Delete "${activeName}"? This can't be undone.`)) return;
    persistLibrary(library.filter((e) => e.id !== activeId));
    newInvoice(true);
  };

  const newInvoice = (silent) => {
    if (!silent && dirty && !window.confirm('Start a new blank-template invoice? Unsaved changes will be lost.'))
      return;
    loadInto(
      {
        meta: DEFAULT_META,
        sections: buildInitialSections(),
        notes: DEFAULT_NOTES,
        tax: TAX,
        logo,
        company, // keep the current company header on a new invoice
        docType: DEFAULT_DOC_TYPE,
        footer: DEFAULT_FOOTER,
      },
      null,
      ''
    );
  };

  const resetToTemplate = () => {
    if (!window.confirm('Reset the current invoice back to the A26 template? (Your company header is kept.)')) return;
    skipDirty.current = false;
    setMeta(DEFAULT_META);
    setSections(buildInitialSections());
    setNotes(DEFAULT_NOTES);
    setTax(TAX);
    setDocType(DEFAULT_DOC_TYPE);
    setFooter(DEFAULT_FOOTER);
  };

  // ---- structural mutations ---------------------------------
  const mutateSections = (fn) => setSections((prev) => fn(prev));

  const updateItem = (secId, groupId, itemId, patch) =>
    mutateSections((prev) =>
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

  const toggleGroup = (secId, groupId, include) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: sec.groups.map((g) =>
                g.id !== groupId ? g : { ...g, items: g.items.map((it) => ({ ...it, include })) }
              ),
            }
      )
    );

  const setSectionTitle = (secId, title) =>
    mutateSections((prev) => prev.map((s) => (s.id === secId ? { ...s, title } : s)));

  const setGroupName = (secId, groupId, name) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : { ...sec, groups: sec.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) }
      )
    );

  const addItem = (secId, groupId) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: sec.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, items: [...g.items, { id: uid('it'), desc: '', qty: 1, rate: 0, include: true }] }
              ),
            }
      )
    );

  const removeItem = (secId, groupId, itemId) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: sec.groups.map((g) =>
                g.id !== groupId ? g : { ...g, items: g.items.filter((it) => it.id !== itemId) }
              ),
            }
      )
    );

  const addGroup = (secId) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId
          ? sec
          : {
              ...sec,
              groups: [
                ...sec.groups,
                { id: uid('grp'), name: 'New member / group', items: [{ id: uid('it'), desc: '', qty: 1, rate: 0, include: true }] },
              ],
            }
      )
    );

  const removeGroup = (secId, groupId) =>
    mutateSections((prev) =>
      prev.map((sec) =>
        sec.id !== secId ? sec : { ...sec, groups: sec.groups.filter((g) => g.id !== groupId) }
      )
    );

  const addSection = () =>
    mutateSections((prev) => [
      ...prev,
      {
        id: uid('sec'),
        title: 'New Section',
        groups: [{ id: uid('grp'), name: null, items: [{ id: uid('it'), desc: '', qty: 1, rate: 0, include: true }] }],
      },
    ]);

  const removeSection = (secId) => {
    if (!window.confirm('Remove this whole section?')) return;
    mutateSections((prev) => prev.filter((s) => s.id !== secId));
  };

  // ---- notes ------------------------------------------------
  const setNote = (i, v) => setNotes((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  const addNote = () => setNotes((prev) => [...prev, '']);
  const removeNote = (i) => setNotes((prev) => prev.filter((_, idx) => idx !== i));

  // ---- logo -------------------------------------------------
  const onLogoFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = '';
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
      const safe = (activeName || meta.client || 'invoice').replace(/[^\w-]+/g, '_');
      pdf.save(`Lloyds_Invoice_${safe}.pdf`);
    } catch (e) {
      alert('Sorry — PDF export failed. Use the Print button and "Save as PDF" instead.');
      document.body.classList.remove('invoice-exporting');
    } finally {
      setBusy(false);
    }
  };

  // ---- small render helpers ---------------------------------
  const metaField = (key, placeholder) => (
    <input
      className="iv-meta-input"
      value={meta[key] || ''}
      placeholder={placeholder}
      onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
    />
  );

  const companyField = (key, placeholder, className) => (
    <input
      className={className}
      value={company[key] || ''}
      placeholder={placeholder}
      onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
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
            <input type="checkbox" checked={hideExcluded} onChange={(e) => setHideExcluded(e.target.checked)} />
            Hide unticked
          </label>
          <button className="iv-btn iv-btn-ghost" onClick={resetToTemplate}>Reset</button>
          <button className="iv-btn iv-btn-ghost" onClick={doDownloadPdf} disabled={busy}>
            {busy ? 'Working…' : 'Download PDF'}
          </button>
          <button className="iv-btn iv-btn-gold" onClick={doPrint}>Print / Save PDF</button>
        </div>
      </div>

      {/* ── Saved-invoice manager (screen only) ───────────── */}
      <div className="iv-manager no-print">
        <div className="iv-manager-left">
          <label className="iv-manager-lbl">Invoice</label>
          <select
            className="iv-select"
            value={activeId || ''}
            onChange={(e) => (e.target.value ? loadInvoice(e.target.value) : newInvoice())}
          >
            <option value="">＋ New (A26 template){dirty && !activeId ? ' • unsaved' : ''}</option>
            {library.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {activeId && dirty && <span className="iv-dirty">● unsaved changes</span>}
          {activeId && !dirty && <span className="iv-saved">✓ saved</span>}
        </div>
        <div className="iv-manager-right">
          <button className="iv-btn iv-btn-sm iv-btn-gold" onClick={saveInvoice}>
            {activeId ? 'Save' : 'Save…'}
          </button>
          <button className="iv-btn iv-btn-sm iv-btn-ghost" onClick={saveAsNew}>Save as copy</button>
          <button className="iv-btn iv-btn-sm iv-btn-ghost" onClick={() => newInvoice()}>New</button>
          <button
            className="iv-btn iv-btn-sm iv-btn-ghost"
            onClick={deleteInvoice}
            disabled={!activeId}
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── The invoice sheet ─────────────────────────────── */}
      <div className="iv-sheet" ref={sheetRef}>
        {/* Header */}
        <header className="iv-head">
          <div className="iv-head-left">
            <div className="iv-logo-wrap">
              {logo ? (
                <img src={logo} className="iv-logo-img" alt={company.name} />
              ) : (
                <div className="iv-logo">
                  <input
                    className="iv-logo-name"
                    value={company.name}
                    placeholder="Company name"
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  />
                  <input
                    className="iv-logo-tag"
                    value={company.tagline}
                    placeholder="Tagline"
                    onChange={(e) => setCompany({ ...company, tagline: e.target.value })}
                  />
                </div>
              )}
              <div className="iv-logo-controls no-print">
                <label className="iv-logo-btn">
                  {logo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/*" hidden onChange={onLogoFile} />
                </label>
                {logo && (
                  <button className="iv-logo-btn" onClick={() => setLogo(null)}>Remove</button>
                )}
              </div>
            </div>
            <textarea
              className="iv-company-line iv-company-input iv-company-addr iv-autogrow"
              value={company.address}
              placeholder="Company address"
              rows={2}
              onChange={(e) => setCompany({ ...company, address: e.target.value })}
            />
            <div className="iv-company-contact">
              <span className="iv-company-lbl">Phone:</span>
              {companyField('phone', 'Phone', 'iv-company-line iv-company-input iv-company-inline')}
              <span className="iv-company-sep">·</span>
              {companyField('email', 'Email', 'iv-company-line iv-company-input iv-company-inline')}
            </div>
            {companyField('website', 'Website', 'iv-company-line iv-company-input')}
          </div>
          <div className="iv-head-right">
            <input
              className="iv-doc-title"
              value={docType}
              placeholder="Quotation"
              onChange={(e) => setDocType(e.target.value)}
            />
            <div className="iv-doc-meta">
              <label>Ref No.</label>
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
            <div className="iv-billto-title">{metaField('title', 'Event / package title')}</div>
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
                <input
                  className="iv-section-title"
                  value={sec.title}
                  onChange={(e) => setSectionTitle(sec.id, e.target.value)}
                />
                <div className="iv-section-head-right">
                  <span className="iv-section-total">{inr(secTotal)}</span>
                  <button
                    className="iv-icon-btn no-print"
                    title="Remove section"
                    onClick={() => removeSection(sec.id)}
                  >
                    ×
                  </button>
                </div>
              </div>

              {sec.groups.map((g) => {
                const allOn = g.items.length > 0 && g.items.every((it) => it.include);
                return (
                  <div className="iv-group" key={g.id}>
                    {g.name !== null && (
                      <div className="iv-group-head">
                        <label className="iv-group-toggle no-print">
                          <input
                            type="checkbox"
                            checked={allOn}
                            onChange={(e) => toggleGroup(sec.id, g.id, e.target.checked)}
                          />
                        </label>
                        <input
                          className="iv-group-name"
                          value={g.name}
                          onChange={(e) => setGroupName(sec.id, g.id, e.target.value)}
                        />
                        <button
                          className="iv-icon-btn no-print"
                          title="Remove this group"
                          onClick={() => removeGroup(sec.id, g.id)}
                        >
                          ×
                        </button>
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
                          <th className="iv-col-del no-print"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => {
                          const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                          const off = !it.include;
                          if (off && hideExcluded) return null;
                          return (
                            <tr key={it.id} className={`iv-row ${off ? 'iv-row-off' : ''}`}>
                              <td className="iv-col-chk no-print">
                                <input
                                  type="checkbox"
                                  checked={it.include}
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, { include: e.target.checked })
                                  }
                                />
                              </td>
                              <td className="iv-col-desc">
                                <input
                                  className="iv-cell-input"
                                  value={it.desc}
                                  placeholder="Item description"
                                  onChange={(e) =>
                                    updateItem(sec.id, g.id, it.id, { desc: e.target.value })
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
                              <td className="iv-col-del no-print">
                                <button
                                  className="iv-icon-btn"
                                  title="Delete row"
                                  onClick={() => removeItem(sec.id, g.id, it.id)}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <button className="iv-add-link no-print" onClick={() => addItem(sec.id, g.id)}>
                      ＋ Add item
                    </button>
                  </div>
                );
              })}

              <button className="iv-add-link no-print" onClick={() => addGroup(sec.id)}>
                ＋ Add sub-group (band member)
              </button>
            </section>
          );
        })}

        <button className="iv-add-section no-print" onClick={addSection}>
          ＋ Add section
        </button>

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
                  className="iv-tax-input"
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
                  className="iv-tax-input"
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
                  onChange={(e) => setNote(i, e.target.value)}
                />
                <button className="iv-icon-btn no-print" title="Remove note" onClick={() => removeNote(i)}>×</button>
              </li>
            ))}
          </ol>
          <button className="iv-add-link no-print" onClick={addNote}>＋ Add note</button>
        </section>

        <footer className="iv-foot">
          <input
            className="iv-foot-input"
            value={footer}
            placeholder="Closing line"
            onChange={(e) => setFooter(e.target.value)}
          />
          <span className="iv-foot-brand">
            {[company.name, company.tagline].filter(Boolean).join(' ')} · {company.phone}
          </span>
        </footer>
      </div>
    </div>
  );
}
