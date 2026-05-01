// =============================================================
// HTML contract template — renders a sales contract from a Trade
// using plain HTML/CSS so window.print() can produce a clean,
// text-based PDF. No supplier-PDF dependency.
//
// Print styling is inline so it travels with the component when
// it's hosted on a standalone /print route.
// =============================================================
import type { BankProfile, Client, Contact, Entity, Trade } from "../../types";
import { formatDate, formatTons, formatUSD } from "../format";
import { computeFinancials } from "../finance";

interface ContractHTMLProps {
  trade: Trade;
  entity: Entity;
  bank: BankProfile;
  client: Client;
  contact: Contact;
}

export function ContractHTML({
  trade,
  entity,
  bank,
  client,
  contact,
}: ContractHTMLProps) {
  const fin = computeFinancials({
    quantity_tons: trade.quantity_tons,
    frigo_total: trade.frigo_total,
    sale_unit_price: trade.sale_unit_price,
    shipping_cost: trade.shipping_cost,
    insurance_cost: trade.insurance_cost,
    bank_fees: trade.bank_fees,
  });
  const advance = fin.advance_amount;
  const balance = fin.balance_amount;
  const signingDate = trade.signing_date ?? trade.contract_date;

  return (
    <article className="contract-doc">
      {/* — page setup — kept inline so the print route is self-contained.
          Mobile-first: the doc shrinks to fit the viewport on phones,
          locks to 210mm A4 in print, and uses 1fr columns below 640px
          so two-column sections stack readably. */}
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        .contract-doc {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #111318;
          font-size: 9.5pt;
          line-height: 1.25;
          background: #ffffff;
          padding: 16px 12px;
          width: 210mm;
          max-width: 100%;
          min-height: auto;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .contract-doc h1 { font-size: 16pt; font-weight: 700; letter-spacing: 0.01em; margin: 0; }
        .contract-doc h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px; color: #111318; border-bottom: 1px solid #111318; padding-bottom: 3px; }
        .contract-doc table { width: 100%; border-collapse: collapse; }
        .contract-doc th, .contract-doc td { padding: 6px 8px; vertical-align: top; }
        /* Mobile-default: stack 2-col grids */
        .contract-doc .grid-2 { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .contract-doc .grid-2.split { border-top: 1px solid #111318; border-bottom: 1px solid #111318; padding: 8px 0; }
        .contract-doc .grid-2.split > div { padding-right: 8px; }
        .contract-doc .grid-2.split > div:last-child { padding-right: 0; }
        .contract-doc .signatures { margin-top: 24px; display: grid; grid-template-columns: 1fr; gap: 18px; }
        .contract-doc .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
        .contract-doc .muted { color: #343945; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .contract-doc .field { margin-bottom: 4px; }
        .contract-doc .field-label { color: #343945; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 1px; }
        .contract-doc .field-value { color: #111318; font-size: 9pt; word-wrap: break-word; }
        .contract-doc .product-table { border: 1px solid #111318; margin-top: 6px; }
        .contract-doc .product-table th { border-bottom: 1px solid #111318; border-right: 1px solid #111318; text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.06em; color: #111318; }
        .contract-doc .product-table td { border-bottom: 1px solid #111318; border-right: 1px solid #111318; font-size: 9pt; word-wrap: break-word; }
        .contract-doc .product-table tr:last-child td { border-bottom: none; }
        .contract-doc .product-table th:last-child,
        .contract-doc .product-table td:last-child { border-right: none; }
        .contract-doc .product-table tr.total td { font-weight: 700; }
        .contract-doc .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .contract-doc section { margin-bottom: 14px; }
        .contract-doc .sig-block { border-top: 1px solid #111318; padding-top: 6px; font-size: 8.5pt; }
        .contract-doc .sig-block strong { font-size: 9.5pt; }
        .contract-doc .ref-pill { display: inline-block; border: 1px solid #111318; padding: 3px 8px; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.05em; }
        .contract-doc .observations { white-space: pre-wrap; font-size: 9pt; word-wrap: break-word; border: 1px solid #111318; padding: 6px 8px; min-height: 22px; }
        .contract-doc .section-box { border: 1px solid #111318; padding: 6px 8px; }
        /* Tablet+: restore the print-style two-column layout */
        @media (min-width: 640px) {
          .contract-doc { padding: 24mm 18mm 20mm; min-height: 297mm; }
          .contract-doc h1 { font-size: 17pt; }
          .contract-doc .grid-2 { grid-template-columns: 1fr 1fr; gap: 16px; }
          .contract-doc .signatures { grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 30px; }
        }
        /* Print: force A4 dimensions regardless of viewport */
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .contract-doc {
            box-shadow: none !important;
            margin: 0 !important;
            width: 210mm !important;
            max-width: none !important;
            min-height: 297mm !important;
            padding: 24mm 18mm 20mm !important;
          }
          .contract-doc h1 { font-size: 17pt !important; }
          .contract-doc .grid-2 {
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }
          .contract-doc .signatures {
            grid-template-columns: 1fr 1fr !important;
            gap: 26px !important;
          }
        }
      `}</style>

      {/* — header — */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingBottom: 10,
          marginBottom: 12,
          borderBottom: "1px solid #111318",
        }}
      >
        <div>
          <h1>SALES CONTRACT</h1>
          <div className="muted" style={{ marginTop: 3 }}>
            Contrato de Venta Internacional
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ref-pill">N° {trade.trade_reference}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Date · {formatDate(signingDate)}
          </div>
        </div>
      </header>

      {/* — parties — */}
      <section className="grid-2 split">
        <div>
          <h2>Seller / Vendedor</h2>
          <div className="field">
            <div className="field-value" style={{ fontWeight: 600 }}>
              {entity.name}
            </div>
          </div>
          {entity.ruc_ein && (
            <div className="field">
              <div className="field-label">RUC / EIN</div>
              <div className="field-value">{entity.ruc_ein}</div>
            </div>
          )}
          {entity.address && (
            <div className="field">
              <div className="field-label">Address</div>
              <div className="field-value">
                {entity.address}
                {entity.city ? `, ${entity.city}` : ""}
                {entity.country ? `, ${entity.country}` : ""}
              </div>
            </div>
          )}
        </div>
        <div>
          <h2>Buyer / Comprador</h2>
          <div className="field">
            <div className="field-value" style={{ fontWeight: 600 }}>
              {client.company_name}
            </div>
          </div>
          {client.tax_id && (
            <div className="field">
              <div className="field-label">Tax ID</div>
              <div className="field-value">{client.tax_id}</div>
            </div>
          )}
          {(client.address || client.city || client.country) && (
            <div className="field">
              <div className="field-label">Address</div>
              <div className="field-value">
                {[client.address, client.city, client.country]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          )}
          {(client.contact_name || contact?.full_name) && (
            <div className="field">
              <div className="field-label">Attn</div>
              <div className="field-value">
                {client.contact_name ?? contact?.full_name}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* — product — */}
      <section>
        <h2>Product / Producto</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="product-table" style={{ minWidth: 360 }}>
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Description</th>
                <th className="num">Unit price (USD)</th>
                <th className="num">Total (USD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatTons(trade.quantity_tons)}</td>
                <td>{trade.product_description}</td>
                <td className="num">
                  {formatUSD(trade.sale_unit_price).replace("$", "")}
                </td>
                <td className="num">
                  {formatUSD(fin.sale_total).replace("$", "")}
                </td>
              </tr>
              <tr className="total">
                <td colSpan={3} style={{ textAlign: "right" }}>
                  Total contract value (USD)
                </td>
                <td className="num">
                  {formatUSD(fin.sale_total).replace("$", "")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* — shipment terms — */}
      <section className="grid-2">
        <div>
          <h2>Shipment</h2>
          {trade.origin && (
            <div className="field">
              <div className="field-label">Origin</div>
              <div className="field-value">{trade.origin}</div>
            </div>
          )}
          {trade.destination && (
            <div className="field">
              <div className="field-label">Destination</div>
              <div className="field-value">{trade.destination}</div>
            </div>
          )}
          {trade.incoterm && (
            <div className="field">
              <div className="field-label">Incoterm</div>
              <div className="field-value">{trade.incoterm}</div>
            </div>
          )}
          {trade.shipment_date && (
            <div className="field">
              <div className="field-label">Shipment date</div>
              <div className="field-value">{trade.shipment_date}</div>
            </div>
          )}
          {trade.plant_no && (
            <div className="field">
              <div className="field-label">Plant N°</div>
              <div className="field-value">{trade.plant_no}</div>
            </div>
          )}
        </div>
        <div>
          <h2>Specifications</h2>
          {trade.brand && (
            <div className="field">
              <div className="field-label">Brand</div>
              <div className="field-value">{trade.brand}</div>
            </div>
          )}
          {trade.packing && (
            <div className="field">
              <div className="field-label">Packing</div>
              <div className="field-value">{trade.packing}</div>
            </div>
          )}
          {trade.temperature && (
            <div className="field">
              <div className="field-label">Temperature</div>
              <div className="field-value">{trade.temperature}</div>
            </div>
          )}
          {trade.validity && (
            <div className="field">
              <div className="field-label">Validity</div>
              <div className="field-value">{trade.validity}</div>
            </div>
          )}
          {trade.freight_condition && (
            <div className="field">
              <div className="field-label">Freight</div>
              <div className="field-value">{trade.freight_condition}</div>
            </div>
          )}
        </div>
      </section>

      {/* — payment terms — */}
      <section>
        <h2>Payment Terms / Términos de Pago</h2>
        <div className="grid-2" style={{ marginTop: 6 }}>
          <div className="section-box">
            <div className="field-label" style={{ marginBottom: 4 }}>
              50% Advance
            </div>
            <div
              className="field-value"
              style={{ fontWeight: 600, fontSize: "11pt" }}
            >
              {formatUSD(advance)}
            </div>
            <div
              className="field-value"
              style={{ fontSize: "9.5pt", color: "#434a5c", marginTop: 2 }}
            >
              {trade.prepayment_condition ||
                `Due ${formatDate(trade.advance_due_date ?? signingDate)}`}
            </div>
          </div>
          <div className="section-box">
            <div className="field-label" style={{ marginBottom: 4 }}>
              50% Balance
            </div>
            <div
              className="field-value"
              style={{ fontWeight: 600, fontSize: "11pt" }}
            >
              {formatUSD(balance)}
            </div>
            <div
              className="field-value"
              style={{ fontSize: "9.5pt", color: "#434a5c", marginTop: 2 }}
            >
              {trade.balance_condition || "50% TT against copy of BOL by email"}
            </div>
          </div>
        </div>
      </section>

      {/* — bank — */}
      <section>
        <h2>Bank Details / Datos Bancarios</h2>
        <div className="grid-2" style={{ marginTop: 6 }}>
          <div className="section-box">
            <div className="field-label">Beneficiary</div>
            <div className="field-value">{bank.beneficiary_name}</div>
            {bank.beneficiary_address && (
              <div
                className="field-value"
                style={{ fontSize: "9.5pt", color: "#434a5c" }}
              >
                {bank.beneficiary_address}
              </div>
            )}
            <div className="field-label" style={{ marginTop: 8 }}>
              Beneficiary bank
            </div>
            <div className="field-value">{bank.bank_name}</div>
            <div className="field-value" style={{ fontSize: "9.5pt" }}>
              SWIFT: {bank.bank_swift}
            </div>
            <div className="field-value" style={{ fontSize: "9.5pt" }}>
              Account N°: {bank.account_number}
            </div>
            {bank.ara_number && (
              <div className="field-value" style={{ fontSize: "9.5pt" }}>
                ARA: {bank.ara_number}
              </div>
            )}
          </div>
          <div className="section-box">
            {(bank.intermediary_bank_name || bank.intermediary_bank_swift) && (
              <>
                <div className="field-label">Intermediary bank</div>
                <div className="field-value">{bank.intermediary_bank_name}</div>
                {bank.intermediary_bank_swift && (
                  <div className="field-value" style={{ fontSize: "9.5pt" }}>
                    SWIFT: {bank.intermediary_bank_swift}
                  </div>
                )}
                {bank.intermediary_account_number && (
                  <div className="field-value" style={{ fontSize: "9.5pt" }}>
                    Account: {bank.intermediary_account_number}
                  </div>
                )}
                {bank.intermediary_location && (
                  <div className="field-value" style={{ fontSize: "9.5pt" }}>
                    {bank.intermediary_location}
                  </div>
                )}
              </>
            )}
            <div className="field-label" style={{ marginTop: 8 }}>
              Charges (Field 71A)
            </div>
            <div className="field-value">{bank.field_71a}</div>
          </div>
        </div>
      </section>

      {/* — observations — */}
      {trade.observations && (
        <section>
          <h2>Observations / Observaciones</h2>
          <div className="observations">{trade.observations}</div>
        </section>
      )}

      {/* — signatures — */}
      <div className="signatures">
        <div className="sig-block">
          <div className="muted" style={{ marginBottom: 28 }}>
            Seller signature
          </div>
          <strong>{entity.name}</strong>
          <div style={{ color: "#5e6577", fontSize: "9.5pt" }}>
            {entity.country}
          </div>
        </div>
        <div className="sig-block">
          <div className="muted" style={{ marginBottom: 28 }}>
            Buyer signature
          </div>
          <strong>{client.company_name}</strong>
          <div style={{ color: "#5e6577", fontSize: "9.5pt" }}>
            {client.country}
          </div>
        </div>
      </div>

      {/* — footer — */}
      <footer
        style={{
          marginTop: 22,
          paddingTop: 6,
          borderTop: "1px solid #111318",
          fontSize: 8,
          color: "#4b5160",
          textAlign: "center",
          letterSpacing: "0.04em",
        }}
      >
        Generated by TradeMirror OS · {entity.name} · {formatDate(signingDate)}
      </footer>
    </article>
  );
}
