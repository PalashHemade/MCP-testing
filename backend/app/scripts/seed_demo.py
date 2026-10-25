"""Deterministic, idempotent demo seed data.

Run with: python -m app.scripts.seed_demo

Idempotency: every row is upserted via SQLAlchemy's session.merge() keyed
on its primary key, and every primary key here is derived deterministically
(either a fixed literal matching app.auth.dev_auth, or uuid.uuid5 over a
stable natural key) - rerunning this script updates the same rows in place
rather than duplicating them.

Date determinism note: absolute seed dates are computed relative to the
real calendar date the script is run on (so demo questions like "last
month's billed revenue" keep working whenever you seed), not hardcoded to
a fixed historical date. trip_number / invoice_number / lr_number values
are the stable identifiers tests and demo scripts should key off of.
"""
import asyncio
from datetime import date, timedelta
from decimal import Decimal

from app.auth.dev_auth import TENANT_PRIMARY, TENANT_SECONDARY
from app.db.admin_session import admin_session_scope as session_scope
from app.models.billing import TripBilling
from app.models.customer import Customer
from app.models.document import LogisticsDocument
from app.models.driver import Driver
from app.models.enums import (
    DocumentType,
    DriverStatus,
    ExpenseCategory,
    PaymentStatus,
    TripStatus,
    VehicleStatus,
)
from app.models.expense import TripExpense
from app.models.tenant import Tenant
from app.models.tool_metadata import ToolMetadata
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.mcp.registry import TOOL_SPECS
from app.planner.date_parsing import parse_relative_date_range
from app.retrieval.chunking import chunk_text
from app.seed_ids import deterministic_id as nid


def within(start: date, end: date, day_offset: int) -> date:
    candidate = start + timedelta(days=day_offset)
    return min(candidate, end)


async def seed() -> None:
    today = date.today()
    last_month_start, last_month_end = parse_relative_date_range("last month", today=today)
    this_month_start, this_month_end = parse_relative_date_range("this month", today=today)
    assert last_month_start and last_month_end and this_month_start and this_month_end

    async with session_scope() as session:
        # ---- Tenants ------------------------------------------------
        primary = Tenant(tenant_id=TENANT_PRIMARY, tenant_name="Primary Logistics Co")
        secondary = Tenant(tenant_id=TENANT_SECONDARY, tenant_name="Secondary Freight Co")
        for t in (primary, secondary):
            await session.merge(t)

        # ---- Customers ------------------------------------------------
        customers = {
            "acme": Customer(
                customer_id=nid("customer", "primary", "acme"), tenant_id=TENANT_PRIMARY,
                customer_name="Acme Traders", contact_email="ops@acmetraders.example",
                phone="+91-9800000001", address="12 Dock Road", city="Mumbai",
            ),
            "bharat": Customer(
                customer_id=nid("customer", "primary", "bharat"), tenant_id=TENANT_PRIMARY,
                customer_name="Bharat Textiles", contact_email="logistics@bharattextiles.example",
                phone="+91-9800000002", address="45 Mill Street", city="Surat",
            ),
            "oceanic": Customer(
                customer_id=nid("customer", "primary", "oceanic"), tenant_id=TENANT_PRIMARY,
                customer_name="Oceanic Imports", contact_email="shipping@oceanicimports.example",
                phone="+91-9800000003", address="7 Harbour Lane", city="Mumbai",
            ),
            "southern": Customer(
                customer_id=nid("customer", "secondary", "southern"), tenant_id=TENANT_SECONDARY,
                customer_name="Southern Freight Clients", contact_email="contact@southernfreight.example",
                phone="+91-9800000004", address="3 Port Avenue", city="Chennai",
            ),
        }
        for c in customers.values():
            await session.merge(c)

        # ---- Vehicles ------------------------------------------------
        vehicles = {
            "v1": Vehicle(
                vehicle_id=nid("vehicle", "primary", "v1"), tenant_id=TENANT_PRIMARY,
                registration_no="MH-12-AB-1234", vehicle_type="truck",
                capacity_tonnes=Decimal("10"), vehicle_status=VehicleStatus.ACTIVE,
            ),
            "v2": Vehicle(
                vehicle_id=nid("vehicle", "primary", "v2"), tenant_id=TENANT_PRIMARY,
                registration_no="MH-14-CD-5678", vehicle_type="trailer",
                capacity_tonnes=Decimal("20"), vehicle_status=VehicleStatus.ACTIVE,
            ),
            "v3": Vehicle(
                vehicle_id=nid("vehicle", "primary", "v3"), tenant_id=TENANT_PRIMARY,
                registration_no="GJ-05-EF-9012", vehicle_type="truck",
                capacity_tonnes=Decimal("8"), vehicle_status=VehicleStatus.MAINTENANCE,
            ),
            "v4": Vehicle(
                vehicle_id=nid("vehicle", "secondary", "v4"), tenant_id=TENANT_SECONDARY,
                registration_no="KA-03-GH-3456", vehicle_type="truck",
                capacity_tonnes=Decimal("12"), vehicle_status=VehicleStatus.ACTIVE,
            ),
        }
        for v in vehicles.values():
            await session.merge(v)

        # ---- Drivers ------------------------------------------------
        drivers = {
            "ramesh": Driver(
                driver_id=nid("driver", "primary", "ramesh"), tenant_id=TENANT_PRIMARY,
                driver_name="Ramesh Kumar", phone="+91-9811111001", licence_number="DL-PR-0001",
                driver_status=DriverStatus.ACTIVE,
            ),
            "suresh": Driver(
                driver_id=nid("driver", "primary", "suresh"), tenant_id=TENANT_PRIMARY,
                driver_name="Suresh Yadav", phone="+91-9811111002", licence_number="DL-PR-0002",
                driver_status=DriverStatus.ACTIVE,
            ),
            "vikram": Driver(
                driver_id=nid("driver", "primary", "vikram"), tenant_id=TENANT_PRIMARY,
                driver_name="Vikram Singh", phone="+91-9811111003", licence_number="DL-PR-0003",
                driver_status=DriverStatus.ACTIVE,
            ),
            "arjun": Driver(
                driver_id=nid("driver", "secondary", "arjun"), tenant_id=TENANT_SECONDARY,
                driver_name="Arjun Nair", phone="+91-9811111004", licence_number="DL-SC-0001",
                driver_status=DriverStatus.ACTIVE,
            ),
            # Deliberately ambiguous with "Ramesh Kumar" when searched by the
            # bare first name "Ramesh" - used by the ambiguous-driver-name
            # planner evaluation case (see tests/evaluation).
            "ramesh_gupta": Driver(
                driver_id=nid("driver", "primary", "ramesh_gupta"), tenant_id=TENANT_PRIMARY,
                driver_name="Ramesh Gupta", phone="+91-9811111005", licence_number="DL-PR-0004",
                driver_status=DriverStatus.ACTIVE,
            ),
        }
        for d in drivers.values():
            await session.merge(d)

        trips: dict[str, Trip] = {}
        billings: list[TripBilling] = []
        expenses: list[TripExpense] = []

        def add_trip(
            key: str, *, tenant_id, trip_number, customer, vehicle, driver, lr_number,
            origin, destination, start_date, planned_delivery_date=None, actual_delivery_date=None,
            distance_km=None, trip_status, cargo="General cargo",
        ) -> Trip:
            trip = Trip(
                trip_id=nid("trip", tenant_id.hex, trip_number), tenant_id=tenant_id,
                trip_number=trip_number, customer_id=customer.customer_id,
                vehicle_id=vehicle.vehicle_id, driver_id=driver.driver_id, lr_number=lr_number,
                origin=origin, destination=destination, start_date=start_date,
                planned_delivery_date=planned_delivery_date, actual_delivery_date=actual_delivery_date,
                distance_km=distance_km, trip_status=trip_status, cargo_description=cargo,
            )
            trips[key] = trip
            return trip

        def add_invoice(trip: Trip, *, suffix, freight, additional, tax, paid, status, invoice_date, due_date):
            billings.append(
                TripBilling(
                    billing_id=nid("invoice", trip.tenant_id.hex, trip.trip_number, suffix),
                    tenant_id=trip.tenant_id, trip_id=trip.trip_id,
                    invoice_number=f"INV-{trip.trip_number}-{suffix}",
                    freight_charge=Decimal(freight), additional_charges=Decimal(additional),
                    tax_amount=Decimal(tax), amount_paid=Decimal(paid),
                    invoice_date=invoice_date, due_date=due_date, payment_status=status,
                )
            )

        def add_expense(trip: Trip, *, category, amount, expense_date, description, suffix):
            expenses.append(
                TripExpense(
                    expense_id=nid("expense", trip.tenant_id.hex, trip.trip_number, suffix),
                    tenant_id=trip.tenant_id, trip_id=trip.trip_id, expense_category=category,
                    amount=Decimal(amount), expense_date=expense_date, description=description,
                )
            )

        lm = lambda n: within(last_month_start, last_month_end, n)  # noqa: E731
        tm = lambda n: within(this_month_start, this_month_end, n)  # noqa: E731

        # ---- Hand-crafted "interesting" trips (PRIMARY tenant) --------
        t = add_trip(
            "1001", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1001", customer=customers["acme"],
            vehicle=vehicles["v1"], driver=drivers["ramesh"], lr_number="LR-1001",
            origin="Mumbai", destination="Delhi", start_date=lm(4), actual_delivery_date=lm(7),
            distance_km=Decimal("1400"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=50000, additional=2000, tax=5000, paid=57000,
                    status=PaymentStatus.PAID, invoice_date=lm(7), due_date=lm(17))
        add_expense(t, category=ExpenseCategory.FUEL, amount=12000, expense_date=lm(5), description="Diesel refills", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=3000, expense_date=lm(5), description="Highway tolls", suffix="2")
        add_expense(t, category=ExpenseCategory.LOADING, amount=1000, expense_date=lm(4), description="Loading labour", suffix="3")

        t = add_trip(
            "1002", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1002", customer=customers["bharat"],
            vehicle=vehicles["v2"], driver=drivers["suresh"], lr_number="LR-1002",
            origin="Delhi", destination="Kolkata", start_date=lm(9), actual_delivery_date=lm(12),
            distance_km=Decimal("1500"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=55000, additional=3000, tax=2000, paid=30000,
                    status=PaymentStatus.PARTIALLY_PAID, invoice_date=lm(12), due_date=lm(22))
        add_expense(t, category=ExpenseCategory.ALLOWANCE, amount=2000, expense_date=lm(10), description="Driver allowance", suffix="1")
        add_expense(t, category=ExpenseCategory.MAINTENANCE, amount=5000, expense_date=lm(11), description="Minor repair", suffix="2")

        t = add_trip(
            "1003", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1003", customer=customers["oceanic"],
            vehicle=vehicles["v1"], driver=drivers["vikram"], lr_number="LR-1003",
            origin="Mumbai", destination="Pune", start_date=lm(2), actual_delivery_date=lm(2),
            distance_km=Decimal("150"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=7000, additional=500, tax=500, paid=0,
                    status=PaymentStatus.UNPAID, invoice_date=lm(2), due_date=lm(9))
        add_expense(t, category=ExpenseCategory.FUEL, amount=4000, expense_date=lm(2), description="Diesel", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=500, expense_date=lm(2), description="Tolls", suffix="2")

        t = add_trip(
            "1004", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1004", customer=customers["acme"],
            vehicle=vehicles["v3"], driver=drivers["ramesh"], lr_number="LR-1004",
            origin="Delhi", destination="Jaipur", start_date=lm(14), actual_delivery_date=lm(15),
            distance_km=Decimal("280"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=13000, additional=1000, tax=1000, paid=15000,
                    status=PaymentStatus.PAID, invoice_date=lm(15), due_date=lm(25))
        add_expense(t, category=ExpenseCategory.FUEL, amount=5000, expense_date=lm(14), description="Diesel", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=1000, expense_date=lm(14), description="Tolls", suffix="2")
        add_expense(t, category=ExpenseCategory.LOADING, amount=500, expense_date=lm(14), description="Loading", suffix="3")
        add_expense(t, category=ExpenseCategory.ALLOWANCE, amount=500, expense_date=lm(14), description="Allowance", suffix="4")
        add_expense(t, category=ExpenseCategory.MAINTENANCE, amount=2000, expense_date=lm(15), description="Tyre repair", suffix="5")

        t = add_trip(
            "1005", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1005", customer=customers["bharat"],
            vehicle=vehicles["v2"], driver=drivers["suresh"], lr_number="LR-1005",
            origin="Kolkata", destination="Patna", start_date=lm(17), actual_delivery_date=lm(18),
            distance_km=Decimal("500"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=9000, additional=500, tax=500, paid=10000,
                    status=PaymentStatus.PAID, invoice_date=lm(18), due_date=lm(28))
        add_expense(t, category=ExpenseCategory.FUEL, amount=8000, expense_date=lm(17), description="Diesel - long haul", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=2000, expense_date=lm(17), description="Tolls", suffix="2")
        add_expense(t, category=ExpenseCategory.MAINTENANCE, amount=5000, expense_date=lm(18), description="Breakdown repair", suffix="3")

        t = add_trip(
            "1006", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1006", customer=customers["oceanic"],
            vehicle=vehicles["v1"], driver=drivers["vikram"], lr_number="LR-1006",
            origin="Mumbai", destination="Goa", start_date=lm(20), actual_delivery_date=lm(21),
            distance_km=None, trip_status=TripStatus.COMPLETED, cargo="Perishables",
        )
        add_invoice(t, suffix="A", freight=19000, additional=1000, tax=0, paid=20000,
                    status=PaymentStatus.PAID, invoice_date=lm(21), due_date=lm(28))
        add_expense(t, category=ExpenseCategory.FUEL, amount=6000, expense_date=lm(20), description="Diesel", suffix="1")

        t = add_trip(
            "1007", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1007", customer=customers["acme"],
            vehicle=vehicles["v2"], driver=drivers["ramesh"], lr_number="LR-1007",
            origin="Delhi", destination="Chandigarh", start_date=today - timedelta(days=2),
            planned_delivery_date=today + timedelta(days=1), distance_km=Decimal("250"),
            trip_status=TripStatus.IN_TRANSIT,
        )
        add_expense(t, category=ExpenseCategory.FUEL, amount=2000, expense_date=today - timedelta(days=1), description="Diesel", suffix="1")

        t = add_trip(
            "1008", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1008", customer=customers["bharat"],
            vehicle=vehicles["v3"], driver=drivers["suresh"], lr_number="LR-1008",
            origin="Mumbai", destination="Ahmedabad", start_date=lm(24), distance_km=Decimal("530"),
            trip_status=TripStatus.CANCELLED,
        )
        add_invoice(t, suffix="A", freight=11000, additional=1000, tax=0, paid=0,
                    status=PaymentStatus.DRAFT, invoice_date=None, due_date=None)
        add_expense(t, category=ExpenseCategory.TOLL, amount=500, expense_date=lm(24), description="Tolls before cancellation", suffix="1")

        t = add_trip(
            "1009", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1009", customer=customers["acme"],
            vehicle=vehicles["v1"], driver=drivers["vikram"], lr_number="LR-1009",
            origin="Delhi", destination="Lucknow", start_date=lm(6), actual_delivery_date=lm(7),
            distance_km=Decimal("490"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=20000, additional=1000, tax=2000, paid=23000,
                    status=PaymentStatus.PAID, invoice_date=lm(7), due_date=lm(17))
        add_invoice(t, suffix="B", freight=5000, additional=0, tax=500, paid=0,
                    status=PaymentStatus.UNPAID, invoice_date=lm(8), due_date=lm(18))
        add_expense(t, category=ExpenseCategory.FUEL, amount=3000, expense_date=lm(6), description="Diesel", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=500, expense_date=lm(6), description="Tolls", suffix="2")

        t = add_trip(
            "1010", tenant_id=TENANT_PRIMARY, trip_number="TRIP-1010", customer=customers["oceanic"],
            vehicle=vehicles["v2"], driver=drivers["ramesh"], lr_number="LR-1010",
            origin="Pune", destination="Nashik", start_date=lm(11), actual_delivery_date=lm(11),
            distance_km=Decimal("210"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=8500, additional=500, tax=0, paid=9000,
                    status=PaymentStatus.PAID, invoice_date=lm(11), due_date=lm(21))
        # Intentionally no expenses recorded for TRIP-1010 - has_expense_data must be False.

        # ---- Bulk-generated straightforward trips (PRIMARY), 12 more ---
        routes = [
            ("Mumbai", "Nagpur", Decimal("840")), ("Delhi", "Agra", Decimal("230")),
            ("Surat", "Ahmedabad", Decimal("270")), ("Kolkata", "Bhubaneswar", Decimal("440")),
            ("Mumbai", "Indore", Decimal("590")), ("Delhi", "Amritsar", Decimal("450")),
            ("Pune", "Hyderabad", Decimal("560")), ("Chennai", "Bengaluru", Decimal("350")),
            ("Mumbai", "Delhi", Decimal("1400")), ("Delhi", "Kolkata", Decimal("1500")),
            ("Surat", "Mumbai", Decimal("280")), ("Pune", "Mumbai", Decimal("150")),
        ]
        cust_cycle = [customers["acme"], customers["bharat"], customers["oceanic"]]
        veh_cycle = [vehicles["v1"], vehicles["v2"], vehicles["v3"]]
        drv_cycle = [drivers["ramesh"], drivers["suresh"], drivers["vikram"]]

        for i, (origin, destination, distance) in enumerate(routes, start=11):
            trip_number = f"TRIP-10{i}"
            customer = cust_cycle[i % 3]
            vehicle = veh_cycle[i % 3]
            driver = drv_cycle[i % 3]
            start = tm(i % 20) if i % 2 == 0 else lm(i % 26)
            t = add_trip(
                str(i), tenant_id=TENANT_PRIMARY, trip_number=trip_number, customer=customer,
                vehicle=vehicle, driver=driver, lr_number=f"LR-10{i}", origin=origin,
                destination=destination, start_date=start, actual_delivery_date=start + timedelta(days=2),
                distance_km=distance, trip_status=TripStatus.COMPLETED,
            )
            freight = Decimal(distance) * Decimal("35")
            add_invoice(
                t, suffix="A", freight=freight, additional=Decimal("500"), tax=Decimal("500"),
                paid=freight + 1000, status=PaymentStatus.PAID, invoice_date=start + timedelta(days=2),
                due_date=start + timedelta(days=12),
            )
            add_expense(t, category=ExpenseCategory.FUEL, amount=Decimal(distance) * Decimal("8"),
                        expense_date=start, description="Diesel", suffix="1")
            add_expense(t, category=ExpenseCategory.TOLL, amount=Decimal("500"), expense_date=start,
                        description="Tolls", suffix="2")

        # ---- SECONDARY tenant trips ------------------------------------
        t = add_trip(
            "2001", tenant_id=TENANT_SECONDARY, trip_number="TRIP-2001", customer=customers["southern"],
            vehicle=vehicles["v4"], driver=drivers["arjun"], lr_number="LR-2001",
            origin="Chennai", destination="Bengaluru", start_date=lm(5), actual_delivery_date=lm(6),
            distance_km=Decimal("350"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=14000, additional=500, tax=500, paid=15000,
                    status=PaymentStatus.PAID, invoice_date=lm(6), due_date=lm(16))
        add_expense(t, category=ExpenseCategory.FUEL, amount=4000, expense_date=lm(5), description="Diesel", suffix="1")

        t = add_trip(
            "2002", tenant_id=TENANT_SECONDARY, trip_number="TRIP-2002", customer=customers["southern"],
            vehicle=vehicles["v4"], driver=drivers["arjun"], lr_number="LR-2002",
            origin="Chennai", destination="Madurai", start_date=lm(13), actual_delivery_date=lm(14),
            distance_km=Decimal("460"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=16000, additional=500, tax=500, paid=5000,
                    status=PaymentStatus.PARTIALLY_PAID, invoice_date=lm(14), due_date=lm(2))
        add_expense(t, category=ExpenseCategory.FUEL, amount=5000, expense_date=lm(13), description="Diesel", suffix="1")
        add_expense(t, category=ExpenseCategory.TOLL, amount=1000, expense_date=lm(13), description="Tolls", suffix="2")

        t = add_trip(
            "2003", tenant_id=TENANT_SECONDARY, trip_number="TRIP-2003", customer=customers["southern"],
            vehicle=vehicles["v4"], driver=drivers["arjun"], lr_number="LR-2003",
            origin="Bengaluru", destination="Chennai", start_date=today - timedelta(days=1),
            planned_delivery_date=today + timedelta(days=1), distance_km=Decimal("350"),
            trip_status=TripStatus.IN_TRANSIT,
        )

        t = add_trip(
            "2004", tenant_id=TENANT_SECONDARY, trip_number="TRIP-2004", customer=customers["southern"],
            vehicle=vehicles["v4"], driver=drivers["arjun"], lr_number="LR-2004",
            origin="Chennai", destination="Coimbatore", start_date=lm(20), actual_delivery_date=lm(21),
            distance_km=Decimal("500"), trip_status=TripStatus.COMPLETED,
        )
        add_invoice(t, suffix="A", freight=18000, additional=0, tax=0, paid=0,
                    status=PaymentStatus.UNPAID, invoice_date=lm(21), due_date=lm(1))
        add_expense(t, category=ExpenseCategory.FUEL, amount=6000, expense_date=lm(20), description="Diesel", suffix="1")

        for trip in trips.values():
            await session.merge(trip)
        for billing in billings:
            await session.merge(billing)
        for expense in expenses:
            await session.merge(expense)

        # ---- Documents --------------------------------------------------
        documents = [
            LogisticsDocument(
                document_id=nid("document", "global", "port-entry-policy"), tenant_id=None,
                title="Demo Port Entry Documentation Policy", document_type=DocumentType.PORT_REGULATION,
                jurisdiction="Demo Port Authority", source_reference="demo-port-authority/circular/2026-01 (FICTIONAL)",
                document_version="1.0", effective_from=date(2026, 1, 1), effective_to=None,
                is_demo_content=True,
                content=(
                    "FICTIONAL DEMO CONTENT - not a real regulation.\n\n"
                    "Demo Port Authority Circular: Shipment Documentation Requirements\n\n"
                    "All inbound and outbound shipments passing through a Demo Port Authority "
                    "terminal must be accompanied by: (1) a valid Lorry Receipt (LR) referencing "
                    "the carrying vehicle's registration number, (2) a commercial invoice showing "
                    "the gross billed amount and tax breakdown, (3) a packing list describing the "
                    "cargo, and (4) for perishable cargo, a cold-chain compliance declaration.\n\n"
                    "Shipments missing the cold-chain declaration for perishable cargo may be held "
                    "at the terminal pending verification. Demo Port Authority does not require a "
                    "separate customs declaration for domestic (intra-country) shipments."
                ),
            ),
            LogisticsDocument(
                document_id=nid("document", "global", "vehicle-safety-policy"), tenant_id=None,
                title="Demo Vehicle Safety and Loading Policy", document_type=DocumentType.POLICY,
                jurisdiction="National (Demo)", source_reference="internal-demo-policy/VSL-02 (FICTIONAL)",
                document_version="2.0", effective_from=date(2025, 6, 1), effective_to=None,
                is_demo_content=True,
                content=(
                    "FICTIONAL DEMO CONTENT - not a real regulation.\n\n"
                    "Demo Vehicle Safety and Loading Policy\n\n"
                    "Vehicles must not be loaded beyond their declared capacity_tonnes. Drivers "
                    "must log a pre-trip inspection before any trip exceeding 400 km. Vehicles "
                    "under the 'maintenance' status must not be assigned to new trips until "
                    "returned to 'active' status."
                ),
            ),
            LogisticsDocument(
                document_id=nid("document", "primary", "expense-policy"), tenant_id=TENANT_PRIMARY,
                title="Primary Logistics Co Internal Expense Policy", document_type=DocumentType.PROCEDURE,
                jurisdiction="Internal", source_reference="primary-logistics-co/policy/EXP-01 (FICTIONAL)",
                document_version="1.1", effective_from=date(2025, 1, 1), effective_to=None,
                is_demo_content=True,
                content=(
                    "FICTIONAL DEMO CONTENT - internal to Primary Logistics Co; not visible to "
                    "other tenants.\n\nAll fuel and toll expenses must be logged with a receipt "
                    "reference within 48 hours of the expense being incurred. Driver allowances "
                    "are capped at INR 2,000 per trip unless pre-approved by operations."
                ),
            ),
        ]
        for doc in documents:
            await session.merge(doc)

        from app.models.document import DocumentChunk

        for doc in documents:
            for idx, chunk in enumerate(chunk_text(doc.content)):
                await session.merge(
                    DocumentChunk(
                        chunk_id=nid("chunk", str(doc.document_id), str(idx)),
                        document_id=doc.document_id, chunk_index=idx, chunk_text=chunk, embedding=None,
                    )
                )

        # ---- Tool metadata (description fields only; embeddings are
        # populated separately by app.scripts.rebuild_tool_embeddings) ----
        for spec in TOOL_SPECS:
            await session.merge(
                ToolMetadata(
                    tool_id=nid("tool", spec.name),
                    tool_name=spec.name,
                    description=spec.description,
                    purpose=spec.purpose,
                    input_schema=spec.input_model.model_json_schema(),
                    output_schema=spec.output_model.model_json_schema(),
                    prerequisites=spec.prerequisites,
                    dependencies=spec.dependencies,
                    limitations=spec.limitations,
                    permissions=spec.permissions,
                    result_semantics=spec.result_semantics,
                )
            )

    print(
        f"Seed complete: {len(trips)} trips, {len(billings)} invoices, "
        f"{len(expenses)} expense entries, {len(documents)} documents, "
        f"{len(TOOL_SPECS)} tool-metadata rows."
    )


if __name__ == "__main__":
    asyncio.run(seed())
