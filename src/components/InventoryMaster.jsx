// ============================================================
// InventoryMaster — Lloyds Pro Sound master gear list
// ============================================================
// Catalogue + stock sheet in one: every unique piece of gear with a standard
// day-rate, a "Qty Owned" stock column, and free-text notes. Grouped by
// category, searchable, fully editable. Persists to localStorage under the
// shared INVENTORY_KEY so the invoice builder's "Add item" picks from the
// same list. Export to CSV or print.

import { useEffect, useMemo, useState } from 'react';
import {
  INVENTORY_KEY,
  INVENTORY_CATEGORIES,
  DEFAULT_INVENTORY,
} from '../lib/inventoryData.js';

const inr = (n) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

const uid = (p = 'inv') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function loadInventory() {
  if (typeof window === 'undefined') return DEFAULT_INVENTORY;
  try {
    const raw = window.localStorage.getItem(INVENTORY_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_INVENTORY;
  } catch {
    return DEFAULT_INVENTORY;
  }
}

export default function InventoryMaster() {
  const [items, setItems] = useState(loadInventory);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');

  useEffect(() => {
    try {
      window.localStorage.setItem(INVENTORY_KEY, JSON.stringify(items));
    } catch {
      /* non-fatal */
    }
  }, [items]);

  const update = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const addItem = () => {
    const category = cat === 'All' ? INVENTORY_CATEGORIES[0] : cat;
    setItems((prev) => [
      { id: uid(), name: '', category, rate: 0, qtyOwned: '', notes: '' },
      ...prev,
    ]);
  };

  const resetAll = () => {
    if (!window.confirm('Reset the master list back to the original catalogue? Your edits and stock counts will be lost.'))
      return;
    setItems(DEFAULT_INVENTORY.map((it) => ({ ...it })));
  };

  // Filter + group
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        (cat === 'All' || it.category === cat) &&
        (!q ||
          it.name.toLowerCase().includes(q) ||
          (it.notes || '').toLowerCase().includes(q))
    );
  }, [items, query, cat]);

  const grouped = useMemo(() => {
    const map = {};
    for (const it of filtered) (map[it.category] ||= []).push(it);
    // preserve category order, then any custom categories
    const order = [...INVENTORY_CATEGORIES];
    for (const c of Object.keys(map)) if (!order.includes(c)) order.push(c);
    return order.filter((c) => map[c]).map((c) => [c, map[c]]);
  }, [filtered]);

  const totalUnits = useMemo(
    () => items.reduce((t, it) => t + (Number(it.qtyOwned) || 0), 0),
    [items]
  );

  const exportCsv = () => {
    const head = ['Item', 'Category', 'Rate/Day (INR)', 'Qty Owned', 'Notes'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map((it) => [it.name, it.category, it.rate, it.qtyOwned, it.notes].map(esc).join(','));
    const csv = [head.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Lloyds_Inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="inv-root">
      {/* Toolbar */}
      <div className="inv-toolbar no-print">
        <div className="inv-brand">
          <span className="inv-logo">LLOYDS</span>
          <span className="inv-sub">Inventory Master</span>
        </div>
        <div className="inv-actions">
          <a className="inv-link" href="/invoice/">Invoice Builder ↗</a>
          <button className="inv-btn inv-btn-ghost" onClick={resetAll}>Reset</button>
          <button className="inv-btn inv-btn-ghost" onClick={exportCsv}>Export CSV</button>
          <button className="inv-btn inv-btn-gold" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="inv-sheet">
        <header className="inv-head">
          <div>
            <h1 className="inv-title">Inventory Master List</h1>
            <p className="inv-tagline">Lloyds Pro Sound · equipment rate card & stock</p>
          </div>
          <div className="inv-summary">
            <div><strong>{items.length}</strong><span>items</span></div>
            <div><strong>{totalUnits}</strong><span>units owned</span></div>
          </div>
        </header>

        {/* Controls */}
        <div className="inv-controls no-print">
          <input
            className="inv-search"
            placeholder="Search gear or notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="inv-cats">
            {['All', ...INVENTORY_CATEGORIES].map((c) => (
              <button
                key={c}
                className={`inv-cat ${cat === c ? 'is-active' : ''}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="inv-btn inv-btn-gold inv-add" onClick={addItem}>＋ Add item</button>
        </div>

        {grouped.length === 0 && <p className="inv-empty">No items match your search.</p>}

        {grouped.map(([category, list]) => (
          <section className="inv-cat-block" key={category}>
            <div className="inv-cat-head">
              <h3>{category}</h3>
              <span className="inv-cat-count">{list.length} item{list.length === 1 ? '' : 's'}</span>
            </div>
            <table className="inv-table">
              <thead>
                <tr>
                  <th className="inv-c-name">Item</th>
                  <th className="inv-c-cat no-print">Category</th>
                  <th className="inv-c-rate">Rate / Day</th>
                  <th className="inv-c-qty">Qty Owned</th>
                  <th className="inv-c-notes">Notes</th>
                  <th className="inv-c-del no-print"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.id}>
                    <td className="inv-c-name">
                      <input
                        className="inv-in"
                        value={it.name}
                        placeholder="Item name"
                        onChange={(e) => update(it.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="inv-c-cat no-print">
                      <select
                        className="inv-in inv-catsel"
                        value={it.category}
                        onChange={(e) => update(it.id, { category: e.target.value })}
                      >
                        {INVENTORY_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {!INVENTORY_CATEGORIES.includes(it.category) && (
                          <option value={it.category}>{it.category}</option>
                        )}
                      </select>
                    </td>
                    <td className="inv-c-rate">
                      <span className="inv-rupee">₹</span>
                      <input
                        className="inv-in inv-num"
                        type="number"
                        min="0"
                        value={it.rate}
                        onChange={(e) =>
                          update(it.id, { rate: e.target.value === '' ? '' : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="inv-c-qty">
                      <input
                        className="inv-in inv-num"
                        type="number"
                        min="0"
                        placeholder="—"
                        value={it.qtyOwned}
                        onChange={(e) =>
                          update(it.id, { qtyOwned: e.target.value === '' ? '' : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="inv-c-notes">
                      <input
                        className="inv-in"
                        value={it.notes}
                        placeholder="—"
                        onChange={(e) => update(it.id, { notes: e.target.value })}
                      />
                    </td>
                    <td className="inv-c-del no-print">
                      <button className="inv-icon-btn" title="Delete item" onClick={() => remove(it.id)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <footer className="inv-foot">
          <span>Rates are standard per-day hire; final quote may vary per event.</span>
          <span>Lloyds Pro Sound</span>
        </footer>
      </div>
    </div>
  );
}
