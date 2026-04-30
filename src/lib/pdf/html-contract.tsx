// =============================================================
// HTML contract template — renders a sales contract from a Trade
// using plain HTML/CSS so window.print() can produce a clean,
// text-based PDF. No supplier-PDF dependency.
//
// Print styling is inline so it travels with the component when
// it's hosted on a standalone /print route.
// =============================================================
import type {
  BankProfile,
  Client,
  Contact,
  Entity,
  Trade,
} from '../../types';
import { formatDate, formatTons, formatUSD } from '../format';
import { computeFinancials } from '../finance';

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
      {/* — page setup — kept inline so the print route is self-contained */}
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .contract-doc { box-shadow: none !important; margin: 0 !important; }
        }
        .contract-doc {
          font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1d2230;
          font-size: 11pt;
          line-height: 1.45;
          background: #ffffff;
          padding: 28mm 22mm 24mm;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .contract-doc h1 { font-size: 20pt; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
        .contract-doc h2 { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; color: #0f1320; border-bottom: 1px solid #1d2230; padding-bottom: 4px; }
        .contract-doc table { width: 100%; border-collapse: collapse; }
        .contract-doc th, .contract-doc td { padding: 8px 10px; vertical-align: top; }
        .contract-doc .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .contract-doc .row { display: flex; justify-content: space-between; gap: 20px; }
        .contract-doc .muted { color: #5e6577; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
        .contract-doc .field { margin-bottom: 6px; }
        .contract-doc .field-label { color: #5e6577; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 1px; }
        .contract-doc .field-value { color: #1d2230; font-size: 10.5pt; }
        .contract-doc .product-table { border-collapse: collapse; margin-top: 8px; }
        .contract-doc .product-table th { background: #f7f8fa; border-bottom: 2px solid #1d2230; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #434a5c; }
        .contract-doc .product-table td { border-bottom: 1px solid #e5e7ec; font-size: 10.5pt; }
        .contract-doc .product-table tr.total td { font-weight: 700; border-bottom: 2px solid #1d2230; background: #f7f8fa; }
        .contract-doc .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
        .contract-doc section { margin-bottom: 18px; }
        .contract-doc .signatures { margin-top: 38px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .contract-doc .sig-block { border-top: 1px solid #1d2230; padding-top: 6px; font-size: 9.5pt; }
        .contract-doc .sig-block strong { font-size: 10.5pt; }
        .contract-doc .ref-pill { display: inline-block; background: #0f1320; color: white; padding: 4px 10px; border-radius: 4px; font-size: 9.5pt; font-weight: 600; letter-spacing: 0.04em; }
        .contract-doc .observations { white-space: pre-wrap; font-size: 10pt; }
      `}</style>

      {/* — header — */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 14,
          marginBottom: 18,
          borderBottom: '2px solid #1d2230',
        }}
      >
        <div>
          <h1>SALES CONTRACT</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            Contrato de Venta Internacional
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ref-pill">N° {trade.trade_reference}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Date · {formatDate(signingDate)}
          </div>
        </div>
      </header>

      {/* — parties — */}
      <section className="grid-2">
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
                {entity.city ? `, ${entity.city}` : ''}
                {entity.country ? `, ${entity.country}` : ''}
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
                  .join(', ')}
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
        <table className="product-table">
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
                {formatUSD(trade.sale_unit_price).replace('$', '')}
              </td>
              <td className="num">
                {formatUSD(fin.sale_total).replace('$', '')}
              </td>
            </tr>
            <tr className="total">
              <td colSpan={3} style={{ textAlign: 'right' }}>
                Total contract value (USD)
              </td>
              <td className="num">
                {formatUSD(fin.sale_total).replace('$', '')}
              </td>
            </tr>
          </tbody>
        </table>
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginTop: 6,
          }}
        >
          <div
            style={{
              border: '1px solid #e5e7ec',
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <div className="field-label" style={{ marginBottom: 4 }}>
              50% Advance
            </div>
            <div
              className="field-value"
              style={{ fontWeight: 600, fontSize: '11pt' }}
            >
              {formatUSD(advance)}
            </div>
            <div
              className="field-value"
              style={{ fontSize: '9.5pt', color: '#434a5c', marginTop: 2 }}
            >
              {trade.prepayment_condition || `Due ${formatDate(trade.advance_due_date ?? signingDate)}`}
            </div>
          </div>
          <div
            style={{
              border: '1px solid #e5e7ec',
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <div className="field-label" style={{ marginBottom: 4 }}>
              50% Balance
            </div>
            <div
              className="field-value"
              style={{ fontWeight: 600, fontSize: '11pt' }}
            >
              {formatUSD(balance)}
            </div>
            <div
              className="field-value"
              style={{ fontSize: '9.5pt', color: '#434a5c', marginTop: 2 }}
            >
              {trade.balance_condition || '50% TT against copy of BOL by email'}
            </div>
          </div>
        </div>
      </section>

      {/* — bank — */}
      <section>
        <h2>Bank Details / Datos Bancarios</h2>
        <div className="grid-2" style={{ marginTop: 6 }}>
          <div>
            <div className="field-label">Beneficiary</div>
            <div className="field-value">{bank.beneficiary_name}</div>
            {bank.beneficiary_address && (
              <div
                className="field-value"
                style={{ fontSize: '9.5pt', color: '#434a5c' }}
              >
                {bank.beneficiary_address}
              </div>
            )}
            <div className="field-label" style={{ marginTop: 8 }}>
              Beneficiary bank
            </div>
            <div className="field-value">{bank.bank_name}</div>
            <div className="field-value" style={{ fontSize: '9.5pt' }}>
              SWIFT: {bank.bank_swift}
            </div>
            <div className="field-value" style={{ fontSize: '9.5pt' }}>
              Account N°: {bank.account_number}
            </div>
            {bank.ara_number && (
              <div className="field-value" style={{ fontSize: '9.5pt' }}>
                ARA: {bank.ara_number}
              </div>
            )}
          </div>
          <div>
            {(bank.intermediary_bank_name || bank.intermediary_bank_swift) && (
              <>
                <div className="field-label">Intermediary bank</div>
                <div className="field-value">
                  {bank.intermediary_bank_name}
                </div>
                {bank.intermediary_bank_swift && (
                  <div className="field-value" style={{ fontSize: '9.5pt' }}>
                    SWIFT: {bank.intermediary_bank_swift}
                  </div>
                )}
                {bank.intermediary_account_number && (
                  <div className="field-value" style={{ fontSize: '9.5pt' }}>
                    Account: {bank.intermediary_account_number}
                  </div>
                )}
                {bank.intermediary_location && (
                  <div className="field-value" style={{ fontSize: '9.5pt' }}>
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
          <div style={{ color: '#5e6577', fontSize: '9.5pt' }}>
            {entity.country}
          </div>
        </div>
        <div className="sig-block">
          <div className="muted" style={{ marginBottom: 28 }}>
            Buyer signature
          </div>
          <strong>{client.company_name}</strong>
          <div style={{ color: '#5e6577', fontSize: '9.5pt' }}>
            {client.country}
          </div>
        </div>
      </div>

      {/* — footer — */}
      <footer
        style={{
          marginTop: 28,
          paddingTop: 8,
          borderTop: '1px solid #e5e7ec',
          fontSize: 8.5,
          color: '#8a93a8',
          textAlign: 'center',
          letterSpacing: '0.03em',
        }}
      >
        Generated by TradeMirror OS · {entity.name} · {formatDate(signingDate)}
      </footer>
    </article>
  );
}
