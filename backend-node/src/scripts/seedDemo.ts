/** Deterministic, idempotent demo seed data - a faithful port of the
 * Python sibling backend's app.scripts.seed_demo, so the two backends'
 * demo scenarios (negative profit, missing distance, multi-invoice
 * trip, cancelled trip, ambiguous driver names, etc.) stay comparable.
 * Run with: npm run db:seed
 *
 * Idempotency: every row is upserted by its deterministic primary key
 * (see upsert.ts) - rerunning updates the same rows rather than
 * duplicating them.
 *
 * Date determinism note: absolute seed dates are computed relative to
 * the real calendar date the script is run on, not a fixed historical
 * date - trip_number/invoice_number/lr_number are the stable identifiers
 * to key test assertions off of, not absolute dates.
 */
import "../config/loadEnv.js";
import { getAdminPool } from "../db/adminPool.js";
import { deterministicId } from "../db/seedIds.js";
import { TENANT_PRIMARY, TENANT_SECONDARY } from "../auth/devAuth.js";
import { parseRelativeDateRange } from "../planner/dateParsing.js";
import { upsert } from "../db/upsert.js";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function within(start: string, end: string, offset: number): string {
  const candidate = addDays(start, offset);
  return candidate > end ? end : candidate;
}

async function seed(): Promise<void> {
  const pool = getAdminPool();
  const today = new Date().toISOString().slice(0, 10);
  const [lastMonthStart, lastMonthEnd] = parseRelativeDateRange("last month", new Date(today));
  const [thisMonthStart, thisMonthEnd] = parseRelativeDateRange("this month", new Date(today));
  if (!lastMonthStart || !lastMonthEnd || !thisMonthStart || !thisMonthEnd) {
    throw new Error("date range computation failed");
  }
  const lm = (n: number) => within(lastMonthStart, lastMonthEnd, n);
  const tm = (n: number) => within(thisMonthStart, thisMonthEnd, n);

  // ---- Tenants ------------------------------------------------------
  await upsert(pool, "tenants", "tenant_id", { tenant_id: TENANT_PRIMARY, tenant_name: "Primary Logistics Co" });
  await upsert(pool, "tenants", "tenant_id", { tenant_id: TENANT_SECONDARY, tenant_name: "Secondary Freight Co" });

  // ---- Customers ------------------------------------------------------
  const customers = {
    acme: { customer_id: deterministicId("customer", "primary", "acme"), tenant_id: TENANT_PRIMARY, customer_name: "Acme Traders", contact_email: "ops@acmetraders.example", phone: "+91-9800000001", address: "12 Dock Road", city: "Mumbai" },
    bharat: { customer_id: deterministicId("customer", "primary", "bharat"), tenant_id: TENANT_PRIMARY, customer_name: "Bharat Textiles", contact_email: "logistics@bharattextiles.example", phone: "+91-9800000002", address: "45 Mill Street", city: "Surat" },
    oceanic: { customer_id: deterministicId("customer", "primary", "oceanic"), tenant_id: TENANT_PRIMARY, customer_name: "Oceanic Imports", contact_email: "shipping@oceanicimports.example", phone: "+91-9800000003", address: "7 Harbour Lane", city: "Mumbai" },
    southern: { customer_id: deterministicId("customer", "secondary", "southern"), tenant_id: TENANT_SECONDARY, customer_name: "Southern Freight Clients", contact_email: "contact@southernfreight.example", phone: "+91-9800000004", address: "3 Port Avenue", city: "Chennai" },
  };
  for (const c of Object.values(customers)) await upsert(pool, "customers", "customer_id", c);

  // ---- Vehicles ------------------------------------------------------
  const vehicles = {
    v1: { vehicle_id: deterministicId("vehicle", "primary", "v1"), tenant_id: TENANT_PRIMARY, registration_no: "MH-12-AB-1234", vehicle_type: "truck", capacity_tonnes: "10", vehicle_status: "active" },
    v2: { vehicle_id: deterministicId("vehicle", "primary", "v2"), tenant_id: TENANT_PRIMARY, registration_no: "MH-14-CD-5678", vehicle_type: "trailer", capacity_tonnes: "20", vehicle_status: "active" },
    v3: { vehicle_id: deterministicId("vehicle", "primary", "v3"), tenant_id: TENANT_PRIMARY, registration_no: "GJ-05-EF-9012", vehicle_type: "truck", capacity_tonnes: "8", vehicle_status: "maintenance" },
    v4: { vehicle_id: deterministicId("vehicle", "secondary", "v4"), tenant_id: TENANT_SECONDARY, registration_no: "KA-03-GH-3456", vehicle_type: "truck", capacity_tonnes: "12", vehicle_status: "active" },
  };
  for (const v of Object.values(vehicles)) await upsert(pool, "vehicles", "vehicle_id", v);

  // ---- Drivers ------------------------------------------------------
  const drivers = {
    ramesh: { driver_id: deterministicId("driver", "primary", "ramesh"), tenant_id: TENANT_PRIMARY, driver_name: "Ramesh Kumar", phone: "+91-9811111001", licence_number: "DL-PR-0001", driver_status: "active" },
    suresh: { driver_id: deterministicId("driver", "primary", "suresh"), tenant_id: TENANT_PRIMARY, driver_name: "Suresh Yadav", phone: "+91-9811111002", licence_number: "DL-PR-0002", driver_status: "active" },
    vikram: { driver_id: deterministicId("driver", "primary", "vikram"), tenant_id: TENANT_PRIMARY, driver_name: "Vikram Singh", phone: "+91-9811111003", licence_number: "DL-PR-0003", driver_status: "active" },
    arjun: { driver_id: deterministicId("driver", "secondary", "arjun"), tenant_id: TENANT_SECONDARY, driver_name: "Arjun Nair", phone: "+91-9811111004", licence_number: "DL-SC-0001", driver_status: "active" },
    rameshGupta: { driver_id: deterministicId("driver", "primary", "ramesh_gupta"), tenant_id: TENANT_PRIMARY, driver_name: "Ramesh Gupta", phone: "+91-9811111005", licence_number: "DL-PR-0004", driver_status: "active" },
  };
  for (const d of Object.values(drivers)) await upsert(pool, "drivers", "driver_id", d);

  const trips: Record<string, unknown>[] = [];
  const billings: Record<string, unknown>[] = [];
  const expenses: Record<string, unknown>[] = [];

  function addTrip(opts: {
    key: string; tenantId: string; tripNumber: string; customerId: string; vehicleId: string; driverId: string;
    lrNumber: string; origin: string; destination: string; startDate: string; plannedDeliveryDate?: string | null;
    actualDeliveryDate?: string | null; distanceKm?: string | null; tripStatus: string; cargo?: string;
  }): { tenantId: string; tripId: string; tripNumber: string } {
    const tripId = deterministicId("trip", opts.tenantId, opts.tripNumber);
    trips.push({
      trip_id: tripId, tenant_id: opts.tenantId, trip_number: opts.tripNumber, customer_id: opts.customerId,
      vehicle_id: opts.vehicleId, driver_id: opts.driverId, lr_number: opts.lrNumber, origin: opts.origin,
      destination: opts.destination, start_date: opts.startDate, planned_delivery_date: opts.plannedDeliveryDate ?? null,
      actual_delivery_date: opts.actualDeliveryDate ?? null, distance_km: opts.distanceKm ?? null,
      trip_status: opts.tripStatus, cargo_description: opts.cargo ?? "General cargo",
    });
    return { tenantId: opts.tenantId, tripId, tripNumber: opts.tripNumber };
  }

  function addInvoice(
    trip: { tenantId: string; tripId: string; tripNumber: string },
    suffix: string,
    opts: { freight: string; additional: string; tax: string; paid: string; status: string; invoiceDate: string | null; dueDate: string | null },
  ): void {
    billings.push({
      billing_id: deterministicId("invoice", trip.tenantId, trip.tripNumber, suffix),
      tenant_id: trip.tenantId, trip_id: trip.tripId, invoice_number: `INV-${trip.tripNumber}-${suffix}`,
      freight_charge: opts.freight, additional_charges: opts.additional, tax_amount: opts.tax,
      amount_paid: opts.paid, invoice_date: opts.invoiceDate, due_date: opts.dueDate, payment_status: opts.status,
    });
  }

  function addExpense(
    trip: { tenantId: string; tripId: string; tripNumber: string },
    suffix: string,
    opts: { category: string; amount: string; date: string; description: string },
  ): void {
    expenses.push({
      expense_id: deterministicId("expense", trip.tenantId, trip.tripNumber, suffix),
      tenant_id: trip.tenantId, trip_id: trip.tripId, expense_category: opts.category,
      amount: opts.amount, expense_date: opts.date, description: opts.description,
    });
  }

  // ---- Hand-crafted "interesting" trips (PRIMARY tenant) ----------------
  let t = addTrip({ key: "1001", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1001", customerId: customers.acme.customer_id, vehicleId: vehicles.v1.vehicle_id, driverId: drivers.ramesh.driver_id, lrNumber: "LR-1001", origin: "Mumbai", destination: "Delhi", startDate: lm(4), actualDeliveryDate: lm(7), distanceKm: "1400", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "50000", additional: "2000", tax: "5000", paid: "57000", status: "paid", invoiceDate: lm(7), dueDate: lm(17) });
  addExpense(t, "1", { category: "fuel", amount: "12000", date: lm(5), description: "Diesel refills" });
  addExpense(t, "2", { category: "toll", amount: "3000", date: lm(5), description: "Highway tolls" });
  addExpense(t, "3", { category: "loading", amount: "1000", date: lm(4), description: "Loading labour" });

  t = addTrip({ key: "1002", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1002", customerId: customers.bharat.customer_id, vehicleId: vehicles.v2.vehicle_id, driverId: drivers.suresh.driver_id, lrNumber: "LR-1002", origin: "Delhi", destination: "Kolkata", startDate: lm(9), actualDeliveryDate: lm(12), distanceKm: "1500", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "55000", additional: "3000", tax: "2000", paid: "30000", status: "partially_paid", invoiceDate: lm(12), dueDate: lm(22) });
  addExpense(t, "1", { category: "allowance", amount: "2000", date: lm(10), description: "Driver allowance" });
  addExpense(t, "2", { category: "maintenance", amount: "5000", date: lm(11), description: "Minor repair" });

  t = addTrip({ key: "1003", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1003", customerId: customers.oceanic.customer_id, vehicleId: vehicles.v1.vehicle_id, driverId: drivers.vikram.driver_id, lrNumber: "LR-1003", origin: "Mumbai", destination: "Pune", startDate: lm(2), actualDeliveryDate: lm(2), distanceKm: "150", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "7000", additional: "500", tax: "500", paid: "0", status: "unpaid", invoiceDate: lm(2), dueDate: lm(9) });
  addExpense(t, "1", { category: "fuel", amount: "4000", date: lm(2), description: "Diesel" });
  addExpense(t, "2", { category: "toll", amount: "500", date: lm(2), description: "Tolls" });

  t = addTrip({ key: "1004", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1004", customerId: customers.acme.customer_id, vehicleId: vehicles.v3.vehicle_id, driverId: drivers.ramesh.driver_id, lrNumber: "LR-1004", origin: "Delhi", destination: "Jaipur", startDate: lm(14), actualDeliveryDate: lm(15), distanceKm: "280", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "13000", additional: "1000", tax: "1000", paid: "15000", status: "paid", invoiceDate: lm(15), dueDate: lm(25) });
  addExpense(t, "1", { category: "fuel", amount: "5000", date: lm(14), description: "Diesel" });
  addExpense(t, "2", { category: "toll", amount: "1000", date: lm(14), description: "Tolls" });
  addExpense(t, "3", { category: "loading", amount: "500", date: lm(14), description: "Loading" });
  addExpense(t, "4", { category: "allowance", amount: "500", date: lm(14), description: "Allowance" });
  addExpense(t, "5", { category: "maintenance", amount: "2000", date: lm(15), description: "Tyre repair" });

  t = addTrip({ key: "1005", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1005", customerId: customers.bharat.customer_id, vehicleId: vehicles.v2.vehicle_id, driverId: drivers.suresh.driver_id, lrNumber: "LR-1005", origin: "Kolkata", destination: "Patna", startDate: lm(17), actualDeliveryDate: lm(18), distanceKm: "500", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "9000", additional: "500", tax: "500", paid: "10000", status: "paid", invoiceDate: lm(18), dueDate: lm(28) });
  addExpense(t, "1", { category: "fuel", amount: "8000", date: lm(17), description: "Diesel - long haul" });
  addExpense(t, "2", { category: "toll", amount: "2000", date: lm(17), description: "Tolls" });
  addExpense(t, "3", { category: "maintenance", amount: "5000", date: lm(18), description: "Breakdown repair" });
  // => negative profit: gross 10000 - expenses 15000 = -5000

  t = addTrip({ key: "1006", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1006", customerId: customers.oceanic.customer_id, vehicleId: vehicles.v1.vehicle_id, driverId: drivers.vikram.driver_id, lrNumber: "LR-1006", origin: "Mumbai", destination: "Goa", startDate: lm(20), actualDeliveryDate: lm(21), distanceKm: null, tripStatus: "completed", cargo: "Perishables" });
  addInvoice(t, "A", { freight: "19000", additional: "1000", tax: "0", paid: "20000", status: "paid", invoiceDate: lm(21), dueDate: lm(28) });
  addExpense(t, "1", { category: "fuel", amount: "6000", date: lm(20), description: "Diesel" });
  // => missing distance: profitPerKm must be null

  t = addTrip({ key: "1007", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1007", customerId: customers.acme.customer_id, vehicleId: vehicles.v2.vehicle_id, driverId: drivers.ramesh.driver_id, lrNumber: "LR-1007", origin: "Delhi", destination: "Chandigarh", startDate: addDays(today, -2), plannedDeliveryDate: addDays(today, 1), distanceKm: "250", tripStatus: "in_transit" });
  addExpense(t, "1", { category: "fuel", amount: "2000", date: addDays(today, -1), description: "Diesel" });

  t = addTrip({ key: "1008", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1008", customerId: customers.bharat.customer_id, vehicleId: vehicles.v3.vehicle_id, driverId: drivers.suresh.driver_id, lrNumber: "LR-1008", origin: "Mumbai", destination: "Ahmedabad", startDate: lm(24), distanceKm: "530", tripStatus: "cancelled" });
  addInvoice(t, "A", { freight: "11000", additional: "1000", tax: "0", paid: "0", status: "draft", invoiceDate: null, dueDate: null });
  addExpense(t, "1", { category: "toll", amount: "500", date: lm(24), description: "Tolls before cancellation" });
  // => cancelled trip, draft invoice excluded from gross: profit = 0 - 500 = -500

  t = addTrip({ key: "1009", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1009", customerId: customers.acme.customer_id, vehicleId: vehicles.v1.vehicle_id, driverId: drivers.vikram.driver_id, lrNumber: "LR-1009", origin: "Delhi", destination: "Lucknow", startDate: lm(6), actualDeliveryDate: lm(7), distanceKm: "490", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "20000", additional: "1000", tax: "2000", paid: "23000", status: "paid", invoiceDate: lm(7), dueDate: lm(17) });
  addInvoice(t, "B", { freight: "5000", additional: "0", tax: "500", paid: "0", status: "unpaid", invoiceDate: lm(8), dueDate: lm(18) });
  addExpense(t, "1", { category: "fuel", amount: "3000", date: lm(6), description: "Diesel" });
  addExpense(t, "2", { category: "toll", amount: "500", date: lm(6), description: "Tolls" });
  // => multiple invoices: gross 28500, paid 23000, outstanding 5500

  t = addTrip({ key: "1010", tenantId: TENANT_PRIMARY, tripNumber: "TRIP-1010", customerId: customers.oceanic.customer_id, vehicleId: vehicles.v2.vehicle_id, driverId: drivers.ramesh.driver_id, lrNumber: "LR-1010", origin: "Pune", destination: "Nashik", startDate: lm(11), actualDeliveryDate: lm(11), distanceKm: "210", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "8500", additional: "500", tax: "0", paid: "9000", status: "paid", invoiceDate: lm(11), dueDate: lm(21) });
  // => intentionally no expenses: hasExpenseData must be false

  // ---- Bulk-generated straightforward trips (PRIMARY), 12 more ----------
  const routes: Array<[string, string, string]> = [
    ["Mumbai", "Nagpur", "840"], ["Delhi", "Agra", "230"], ["Surat", "Ahmedabad", "270"],
    ["Kolkata", "Bhubaneswar", "440"], ["Mumbai", "Indore", "590"], ["Delhi", "Amritsar", "450"],
    ["Pune", "Hyderabad", "560"], ["Chennai", "Bengaluru", "350"], ["Mumbai", "Delhi", "1400"],
    ["Delhi", "Kolkata", "1500"], ["Surat", "Mumbai", "280"], ["Pune", "Mumbai", "150"],
  ];
  const custCycle = [customers.acme, customers.bharat, customers.oceanic];
  const vehCycle = [vehicles.v1, vehicles.v2, vehicles.v3];
  const drvCycle = [drivers.ramesh, drivers.suresh, drivers.vikram];

  routes.forEach(([origin, destination, distance], idx) => {
    const i = idx + 11;
    const tripNumber = `TRIP-10${i}`;
    const customer = custCycle[i % 3]!;
    const vehicle = vehCycle[i % 3]!;
    const driver = drvCycle[i % 3]!;
    const start = i % 2 === 0 ? tm(i % 20) : lm(i % 26);
    const trip = addTrip({
      key: String(i), tenantId: TENANT_PRIMARY, tripNumber, customerId: customer.customer_id,
      vehicleId: vehicle.vehicle_id, driverId: driver.driver_id, lrNumber: `LR-10${i}`, origin, destination,
      startDate: start, actualDeliveryDate: addDays(start, 2), distanceKm: distance, tripStatus: "completed",
    });
    const freight = (Number(distance) * 35).toString();
    addInvoice(trip, "A", {
      freight, additional: "500", tax: "500", paid: (Number(freight) + 1000).toString(), status: "paid",
      invoiceDate: addDays(start, 2), dueDate: addDays(start, 12),
    });
    addExpense(trip, "1", { category: "fuel", amount: (Number(distance) * 8).toString(), date: start, description: "Diesel" });
    addExpense(trip, "2", { category: "toll", amount: "500", date: start, description: "Tolls" });
  });

  // ---- SECONDARY tenant trips --------------------------------------------
  t = addTrip({ key: "2001", tenantId: TENANT_SECONDARY, tripNumber: "TRIP-2001", customerId: customers.southern.customer_id, vehicleId: vehicles.v4.vehicle_id, driverId: drivers.arjun.driver_id, lrNumber: "LR-2001", origin: "Chennai", destination: "Bengaluru", startDate: lm(5), actualDeliveryDate: lm(6), distanceKm: "350", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "14000", additional: "500", tax: "500", paid: "15000", status: "paid", invoiceDate: lm(6), dueDate: lm(16) });
  addExpense(t, "1", { category: "fuel", amount: "4000", date: lm(5), description: "Diesel" });

  t = addTrip({ key: "2002", tenantId: TENANT_SECONDARY, tripNumber: "TRIP-2002", customerId: customers.southern.customer_id, vehicleId: vehicles.v4.vehicle_id, driverId: drivers.arjun.driver_id, lrNumber: "LR-2002", origin: "Chennai", destination: "Madurai", startDate: lm(13), actualDeliveryDate: lm(14), distanceKm: "460", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "16000", additional: "500", tax: "500", paid: "5000", status: "partially_paid", invoiceDate: lm(14), dueDate: lm(2) });
  addExpense(t, "1", { category: "fuel", amount: "5000", date: lm(13), description: "Diesel" });
  addExpense(t, "2", { category: "toll", amount: "1000", date: lm(13), description: "Tolls" });

  addTrip({ key: "2003", tenantId: TENANT_SECONDARY, tripNumber: "TRIP-2003", customerId: customers.southern.customer_id, vehicleId: vehicles.v4.vehicle_id, driverId: drivers.arjun.driver_id, lrNumber: "LR-2003", origin: "Bengaluru", destination: "Chennai", startDate: addDays(today, -1), plannedDeliveryDate: addDays(today, 1), distanceKm: "350", tripStatus: "in_transit" });

  t = addTrip({ key: "2004", tenantId: TENANT_SECONDARY, tripNumber: "TRIP-2004", customerId: customers.southern.customer_id, vehicleId: vehicles.v4.vehicle_id, driverId: drivers.arjun.driver_id, lrNumber: "LR-2004", origin: "Chennai", destination: "Coimbatore", startDate: lm(20), actualDeliveryDate: lm(21), distanceKm: "500", tripStatus: "completed" });
  addInvoice(t, "A", { freight: "18000", additional: "0", tax: "0", paid: "0", status: "unpaid", invoiceDate: lm(21), dueDate: lm(1) });
  addExpense(t, "1", { category: "fuel", amount: "6000", date: lm(20), description: "Diesel" });

  for (const trip of trips) await upsert(pool, "trips", "trip_id", trip);
  for (const billing of billings) await upsert(pool, "trip_billing", "billing_id", billing);
  for (const expense of expenses) await upsert(pool, "trip_expenses", "expense_id", expense);

  // ---- Documents ---------------------------------------------------------
  const documents = [
    {
      document_id: deterministicId("document", "global", "port-entry-policy"), tenant_id: null,
      title: "Demo Port Entry Documentation Policy", document_type: "port_regulation",
      jurisdiction: "Demo Port Authority", source_reference: "demo-port-authority/circular/2026-01 (FICTIONAL)",
      document_version: "1.0", effective_from: "2026-01-01", effective_to: null, is_demo_content: true,
      okf_concept_path: "policies/demo_port_policy",
      content:
        "FICTIONAL DEMO CONTENT - not a real regulation.\n\n" +
        "Demo Port Authority Circular: Shipment Documentation Requirements\n\n" +
        "All inbound and outbound shipments passing through a Demo Port Authority terminal must be " +
        "accompanied by: (1) a valid Lorry Receipt (LR) referencing the carrying vehicle's registration " +
        "number, (2) a commercial invoice showing the gross billed amount and tax breakdown, (3) a packing " +
        "list describing the cargo, and (4) for perishable cargo, a cold-chain compliance declaration.\n\n" +
        "Shipments missing the cold-chain declaration for perishable cargo may be held at the terminal " +
        "pending verification. Demo Port Authority does not require a separate customs declaration for " +
        "domestic (intra-country) shipments.",
    },
    {
      document_id: deterministicId("document", "global", "vehicle-safety-policy"), tenant_id: null,
      title: "Demo Vehicle Safety and Loading Policy", document_type: "policy",
      jurisdiction: "National (Demo)", source_reference: "internal-demo-policy/VSL-02 (FICTIONAL)",
      document_version: "2.0", effective_from: "2025-06-01", effective_to: null, is_demo_content: true,
      okf_concept_path: null,
      content:
        "FICTIONAL DEMO CONTENT - not a real regulation.\n\n" +
        "Demo Vehicle Safety and Loading Policy\n\n" +
        "Vehicles must not be loaded beyond their declared capacity_tonnes. Drivers must log a pre-trip " +
        "inspection before any trip exceeding 400 km. Vehicles under the 'maintenance' status must not be " +
        "assigned to new trips until returned to 'active' status.",
    },
    {
      document_id: deterministicId("document", "primary", "expense-policy"), tenant_id: TENANT_PRIMARY,
      title: "Primary Logistics Co Internal Expense Policy", document_type: "procedure",
      jurisdiction: "Internal", source_reference: "primary-logistics-co/policy/EXP-01 (FICTIONAL)",
      document_version: "1.1", effective_from: "2025-01-01", effective_to: null, is_demo_content: true,
      okf_concept_path: "policies/demo_billing_policy",
      content:
        "FICTIONAL DEMO CONTENT - internal to Primary Logistics Co; not visible to other tenants.\n\n" +
        "All fuel and toll expenses must be logged with a receipt reference within 48 hours of the expense " +
        "being incurred. Driver allowances are capped at INR 2,000 per trip unless pre-approved by operations.",
    },
  ];
  for (const doc of documents) await upsert(pool, "logistics_documents", "document_id", doc);

  console.log(
    `Seed complete: ${trips.length} trips, ${billings.length} invoices, ${expenses.length} expense entries, ${documents.length} documents.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
