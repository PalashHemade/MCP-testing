import enum


class TripStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_TRANSIT = "in_transit"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class VehicleStatus(str, enum.Enum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    INACTIVE = "inactive"


class DriverStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    DRAFT = "draft"
    CANCELLED = "cancelled"


class ExpenseCategory(str, enum.Enum):
    FUEL = "fuel"
    TOLL = "toll"
    LOADING = "loading"
    ALLOWANCE = "allowance"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class DocumentType(str, enum.Enum):
    POLICY = "policy"
    PORT_REGULATION = "port_regulation"
    PROCEDURE = "procedure"
    OTHER = "other"
