import type {
  CustomerTripSummaryResult,
  DocumentPassage,
  RouteProfitabilityResult,
  TripDetail,
  TripFinancials,
  TripSummary,
  UnpaidInvoiceRow,
  VehicleUtilizationResult,
} from '../types/api'
import { OverdueBadge, StatusBadge } from './StatusBadge'

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{children}</tbody>
      </table>
    </div>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">{children}</td>
}

function TripsTable({ trips }: { trips: TripSummary[] }) {
  if (trips.length === 0) return <p className="text-sm text-slate-500">No trips matched.</p>
  return (
    <Table headers={['Trip', 'Route', 'Status', 'Customer', 'Vehicle', 'Distance (km)']}>
      {trips.map((t) => (
        <tr key={t.trip_id}>
          <Cell>{t.trip_number}</Cell>
          <Cell>
            {t.origin} → {t.destination}
          </Cell>
          <Cell>
            <StatusBadge status={t.trip_status} />
          </Cell>
          <Cell>{t.customer_name}</Cell>
          <Cell>{t.vehicle_registration_no}</Cell>
          <Cell>{t.distance_km ?? '—'}</Cell>
        </tr>
      ))}
    </Table>
  )
}

function TripDetailCard({ trip }: { trip: TripDetail }) {
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-3 dark:border-slate-700">
      {[
        ['Trip', trip.trip_number],
        ['LR number', trip.lr_number],
        ['Status', <StatusBadge key="s" status={trip.trip_status} />],
        ['Customer', trip.customer_name],
        ['Vehicle', trip.vehicle_registration_no],
        ['Driver', trip.driver_name],
        ['Route', `${trip.origin} → ${trip.destination}`],
        ['Distance', trip.distance_km ? `${trip.distance_km} km` : 'unknown'],
        ['Start date', trip.start_date],
      ].map(([label, value]) => (
        <div key={String(label)}>
          <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Money({ value }: { value: string | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  return <span>₹{Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
}

function FinancialsCard({ f }: { f: TripFinancials }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Gross billed', <Money key="g" value={f.gross_billed_amount} />],
          ['Paid', <Money key="p" value={f.amount_paid} />],
          ['Outstanding', <Money key="o" value={f.outstanding_balance} />],
          ['Expenses', <Money key="e" value={f.recorded_expenses} />],
          ['Profit', <Money key="pr" value={f.trip_profit} />],
          ['Profit / km', f.profit_per_km ? <Money key="pk" value={f.profit_per_km} /> : <span key="pk" className="text-slate-400">undefined</span>],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
      {f.invoices.length > 0 && (
        <Table headers={['Invoice', 'Gross', 'Paid', 'Outstanding', 'Status']}>
          {f.invoices.map((inv) => (
            <tr key={inv.billing_id}>
              <Cell>{inv.invoice_number}</Cell>
              <Cell><Money value={inv.gross_billed_amount} /></Cell>
              <Cell><Money value={inv.amount_paid} /></Cell>
              <Cell><Money value={inv.outstanding_balance} /></Cell>
              <Cell>
                <StatusBadge status={inv.payment_status} />
                <OverdueBadge isOverdue={inv.is_overdue} />
              </Cell>
            </tr>
          ))}
        </Table>
      )}
      {f.notes.length > 0 && (
        <ul className="list-inside list-disc space-y-1 text-xs text-amber-700 dark:text-amber-400">
          {f.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UnpaidInvoicesTable({ invoices }: { invoices: UnpaidInvoiceRow[] }) {
  if (invoices.length === 0) return <p className="text-sm text-slate-500">No matching invoices.</p>
  return (
    <Table headers={['Invoice', 'Trip', 'Customer', 'Outstanding', 'Due', 'Status']}>
      {invoices.map((inv) => (
        <tr key={inv.billing_id}>
          <Cell>{inv.invoice_number}</Cell>
          <Cell>{inv.trip_number}</Cell>
          <Cell>{inv.customer_name}</Cell>
          <Cell><Money value={inv.outstanding_balance} /></Cell>
          <Cell>{inv.due_date ?? '—'}</Cell>
          <Cell>
            <StatusBadge status={inv.payment_status} />
            <OverdueBadge isOverdue={inv.is_overdue} />
          </Cell>
        </tr>
      ))}
    </Table>
  )
}

function VehicleUtilizationTable({ results }: { results: VehicleUtilizationResult[] }) {
  return (
    <Table headers={['Vehicle', 'Type', 'Trips', 'Completed', 'In transit', 'Distance (km)']}>
      {results.map((v) => (
        <tr key={v.vehicle_id}>
          <Cell>{v.registration_no}</Cell>
          <Cell>{v.vehicle_type}</Cell>
          <Cell>{v.trip_count}</Cell>
          <Cell>{v.completed_trip_count}</Cell>
          <Cell>{v.in_transit_trip_count}</Cell>
          <Cell>{v.total_recorded_distance_km}</Cell>
        </tr>
      ))}
    </Table>
  )
}

function CustomerSummaryTable({ results }: { results: CustomerTripSummaryResult[] }) {
  return (
    <Table headers={['Customer', 'Trips', 'Billed', 'Paid', 'Outstanding', 'Profit']}>
      {results.map((c) => (
        <tr key={c.customer_id}>
          <Cell>{c.customer_name}</Cell>
          <Cell>{c.trip_count}</Cell>
          <Cell><Money value={c.gross_billed_amount} /></Cell>
          <Cell><Money value={c.amount_paid} /></Cell>
          <Cell><Money value={c.outstanding_balance} /></Cell>
          <Cell><Money value={c.trip_profit} /></Cell>
        </tr>
      ))}
    </Table>
  )
}

function RouteProfitabilityTable({ results }: { results: RouteProfitabilityResult[] }) {
  return (
    <Table headers={['Route', 'Trips', 'Profit', 'Distance (km)', 'Profit / km']}>
      {results.map((r) => (
        <tr key={`${r.origin}-${r.destination}`}>
          <Cell>
            {r.origin} → {r.destination}
          </Cell>
          <Cell>{r.trip_count}</Cell>
          <Cell><Money value={r.aggregate_profit} /></Cell>
          <Cell>{r.total_distance_km}</Cell>
          <Cell>
            {r.aggregate_profit_per_km ? <Money value={r.aggregate_profit_per_km} /> : <span className="text-slate-400">undefined</span>}
            {r.excluded_below_min_sample && <span className="ml-1 text-xs text-amber-600">(small sample)</span>}
          </Cell>
        </tr>
      ))}
    </Table>
  )
}

function DocumentPassages({ passages, isDemoLabelShown = true }: { passages: DocumentPassage[]; isDemoLabelShown?: boolean }) {
  if (passages.length === 0) return <p className="text-sm text-slate-500">No sufficiently relevant passages found.</p>
  return (
    <div className="space-y-2">
      {passages.map((p) => (
        <div key={`${p.document_id}-${p.chunk_text.slice(0, 20)}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-200">{p.title}</span>
            <span className="text-xs text-slate-500">v{p.document_version}</span>
            {isDemoLabelShown && p.is_demo_content && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                fictional demo content
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{p.chunk_text}</p>
          {p.source_reference && <p className="mt-1 text-xs text-slate-400">Source: {p.source_reference}</p>}
        </div>
      ))}
    </div>
  )
}

/** Renders the structured payload of one tool execution, dispatching on
 * tool_name. Falls back to a raw JSON block for tools without a
 * dedicated view (e.g. future tools added to the registry). */
export function ToolResultView({ toolName, output }: { toolName: string; output: Record<string, unknown> }) {
  switch (toolName) {
    case 'list_trips':
      return <TripsTable trips={(output.trips as TripSummary[]) ?? []} />
    case 'get_trip_details':
      return output.found ? <TripDetailCard trip={output.trip as TripDetail} /> : <p className="text-sm text-slate-500">Trip not found.</p>
    case 'get_trip_financials':
      return output.found ? <FinancialsCard f={output.financials as TripFinancials} /> : <p className="text-sm text-slate-500">Trip not found.</p>
    case 'get_trip_expenses':
      return output.found ? (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Total recorded expenses: <Money value={output.total_recorded_expenses as string} />
        </p>
      ) : (
        <p className="text-sm text-slate-500">Trip not found.</p>
      )
    case 'list_unpaid_invoices':
      return <UnpaidInvoicesTable invoices={(output.invoices as UnpaidInvoiceRow[]) ?? []} />
    case 'get_vehicle_utilization':
      return <VehicleUtilizationTable results={(output.results as VehicleUtilizationResult[]) ?? []} />
    case 'get_customer_trip_summary':
      return <CustomerSummaryTable results={(output.results as CustomerTripSummaryResult[]) ?? []} />
    case 'compare_route_profitability':
      return <RouteProfitabilityTable results={(output.results as RouteProfitabilityResult[]) ?? []} />
    case 'get_driver_trip_history':
      return output.ambiguous ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Ambiguous driver name - multiple drivers matched. Please specify a driver_id.
        </p>
      ) : (
        <TripsTable trips={(output.trips as TripSummary[]) ?? []} />
      )
    case 'search_logistics_documents':
      return <DocumentPassages passages={(output.passages as DocumentPassage[]) ?? []} />
    default:
      return (
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">
          {JSON.stringify(output, null, 2)}
        </pre>
      )
  }
}
