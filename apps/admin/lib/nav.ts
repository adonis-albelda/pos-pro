import type { Route } from "next";
import {
  ArrowLeftRight,
  BadgePercent,
  Boxes,
  ChartColumn,
  ClipboardList,
  ContactRound,
  Download,
  FolderTree,
  Layers,
  LayoutDashboard,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Shield,
  Store,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown on the classic launcher tiles, where there is room for a line. */
  blurb: string;
  /** Tile colour on the classic launcher — legacy screens are colour-coded. */
  tone: "primary" | "accent" | "success" | "warning" | "danger" | "neutral";
  /** Matches a key in FeatureCatalog (Laravel) — hidden when useFeatureFlags().isEnabled(key) is false. Absent = always shown. */
  featureKey?: string;
  /**
   * Spatie permission name from /auth/me. Absent = any signed-in shop admin
   * may see the item once feature flags allow it.
   */
  permissionKey?: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Reserved Spatie keys for People modules that are not in the live nav yet.
 * Seed these with spatie/laravel-permission; add nav rows when screens ship.
 */
export const RESERVED_PERMISSION_KEYS = [
  "people.employees.view",
  "people.attendance.view",
] as const;

/**
 * One nav definition, read by both shells.
 *
 * Groups follow shop jobs so Spatie gates can map 1:1 later:
 * Catalog → Inventory → Purchasing → Sales → Finance → People → Settings.
 * Categories / attributes / add-ons sit under Catalog (with products), not
 * Company settings. People today is Users only; Employees + Attendance come
 * next under the same group (see RESERVED_PERMISSION_KEYS).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        blurb: "Today's takings at a glance",
        tone: "primary",
        permissionKey: "dashboard.view",
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: Package,
        blurb: "Prices, cost, barcodes",
        tone: "primary",
        permissionKey: "catalog.products.view",
      },
      {
        href: "/categories",
        label: "Categories",
        icon: FolderTree,
        blurb: "Shelf tree and markup",
        tone: "success",
        permissionKey: "catalog.categories.view",
      },
      {
        href: "/attributes" as Route,
        label: "Variant Options",
        icon: Tags,
        blurb: "Size, color — build the vocabulary for variants",
        tone: "accent",
        permissionKey: "catalog.attributes.view",
      },
      {
        href: "/addon-groups" as Route,
        label: "Add-on groups",
        icon: Layers,
        blurb: "Toppings, accessories — merchant-configurable extras",
        tone: "warning",
        permissionKey: "catalog.addon_groups.view",
      },
      {
        href: "/product-qr" as Route,
        label: "Product QR codes",
        icon: QrCode,
        blurb: "Print SKU QR sheets",
        tone: "accent",
        permissionKey: "catalog.labels.view",
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        blurb: "Stock counts and movements",
        tone: "success",
        permissionKey: "inventory.stock.view",
      },
      {
        href: "/stock-transfers" as Route,
        label: "Stock transfers",
        icon: ArrowLeftRight,
        blurb: "Move stock between locations",
        tone: "success",
        permissionKey: "inventory.transfers.view",
      },
      {
        href: "/locations" as Route,
        label: "Locations",
        icon: MapPin,
        blurb: "Branches and warehouses",
        tone: "neutral",
        permissionKey: "inventory.locations.view",
      },
    ],
  },
  {
    label: "Purchasing",
    items: [
      {
        href: "/suppliers" as Route,
        label: "Suppliers",
        icon: Truck,
        blurb: "Who you buy stock from",
        tone: "accent",
        featureKey: "suppliers",
        permissionKey: "purchasing.suppliers.view",
      },
      {
        href: "/purchase-orders" as Route,
        label: "Purchase orders",
        icon: ClipboardList,
        blurb: "Terms, balances, receiving",
        tone: "warning",
        featureKey: "purchase_orders",
        permissionKey: "purchasing.orders.view",
      },
      {
        href: "/receiving" as Route,
        label: "Receive orders",
        icon: PackageCheck,
        blurb: "Log a delivery, restock, adjust prices",
        tone: "success",
        featureKey: "purchase_orders",
        permissionKey: "purchasing.receiving.view",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        href: "/sales",
        label: "Sales",
        icon: Receipt,
        blurb: "Every receipt on file",
        tone: "accent",
        permissionKey: "sales.list.view",
      },
      {
        href: "/sales/new" as Route,
        label: "New sale",
        icon: Plus,
        blurb: "Ring up a phone order",
        tone: "primary",
        permissionKey: "sales.create",
      },
      {
        href: "/customers" as Route,
        label: "Customers",
        icon: ContactRound,
        blurb: "Names, addresses, contacts",
        tone: "neutral",
        permissionKey: "sales.customers.view",
      },
      {
        href: "/discounts" as Route,
        label: "Discounts",
        icon: BadgePercent,
        blurb: "Senior/PWD, promos, VAT rules",
        tone: "warning",
        permissionKey: "sales.discounts.view",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/expenses" as Route,
        label: "Expenses",
        icon: Wallet,
        blurb: "Rent, wages, utilities",
        tone: "danger",
        featureKey: "expenses",
        permissionKey: "finance.expenses.view",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: ChartColumn,
        blurb: "Profit, discounts, dead stock",
        tone: "warning",
        permissionKey: "finance.reports.view",
      },
      {
        href: "/export" as Route,
        label: "Export data",
        icon: Download,
        blurb: "CSV, Excel or PDF backup",
        tone: "primary",
        featureKey: "export",
        permissionKey: "finance.export.view",
      },
    ],
  },
  {
    // Employees + Attendance join here when those screens ship
    // (people.employees.view / people.attendance.view).
    label: "People",
    items: [
      {
        href: "/users",
        label: "Users",
        icon: Users,
        blurb: "Logins, roles, PINs",
        tone: "primary",
        permissionKey: "people.users.view",
      },
      {
        href: "/employees" as Route,
        label: "Employees",
        icon: ContactRound,
        blurb: "HR profiles linked to users",
        tone: "success",
        permissionKey: "people.employees.view",
      },
      {
        href: "/access" as Route,
        label: "Access",
        icon: Shield,
        blurb: "Roles and permissions per user",
        tone: "warning",
        permissionKey: "people.roles.manage",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "Company",
        icon: Store,
        blurb: "Shop name, logo, receipt footer",
        tone: "neutral",
        permissionKey: "settings.company.view",
      },
      {
        href: "/receipt" as Route,
        label: "Receipt layout",
        icon: Printer,
        blurb: "PT-210 blocks and preview",
        tone: "warning",
        permissionKey: "settings.receipt.view",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Drops items a superadmin has turned off for this company; a group left with nothing is dropped too. */
export function filterNavGroupsByFeatures(
  groups: NavGroup[],
  isEnabled: (key: string) => boolean,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.featureKey || isEnabled(item.featureKey)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Spatie-ready filter. Call after filterNavGroupsByFeatures once /auth/me
 * returns permission names. Items without permissionKey stay visible.
 */
export function filterNavGroupsByPermissions(
  groups: NavGroup[],
  can: (permissionKey: string) => boolean,
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permissionKey || can(item.permissionKey)),
    }))
    .filter((group) => group.items.length > 0);
}
