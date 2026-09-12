import type { Route } from "next";
import {
  ArrowLeftRight,
  BadgePercent,
  Gift,
  Boxes,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  ContactRound,
  Download,
  FolderTree,
  Layers,
  LayoutDashboard,
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
  Banknote,
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

/** A sub-heading inside a section (e.g. "Catalog"), or null for a bare list of items with no sub-heading. */
export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** The sidebar's top-level, collapsible heading (e.g. "PRODUCT MANAGEMENT"). Null = ungrouped (Dashboard). */
export interface NavSection {
  label: string | null;
  groups: NavGroup[];
}

/**
 * One nav definition, read by both shells.
 *
 * Sections follow shop jobs so Spatie gates can map 1:1 later: Product
 * Management → Inventory Management → Sales Management → Finance Management
 * → People Management → Settings. Each section holds one or more groups —
 * a labelled sub-heading (e.g. "Catalog") or a bare `label: null` list for
 * items that don't need their own sub-heading (e.g. "Product QR codes"
 * sitting directly under Product Management, not nested inside Catalog).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Dashboards",
    groups: [
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
          {
            href: "/sales-dashboard" as Route,
            label: "Sales Dashboard",
            icon: ChartColumn,
            blurb: "Revenue, top products, cashiers",
            tone: "accent",
            permissionKey: "sales.dashboard.view",
          },
        ],
      },
    ],
  },
  {
    label: "Product Management",
    groups: [
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
        ],
      },
      {
        label: null,
        items: [
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
    ],
  },
  {
    label: "Inventory Management",
    groups: [
      {
        label: "Stock",
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
            icon: Store,
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
    ],
  },
  {
    label: "Sales Management",
    groups: [
      {
        label: null,
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
        ],
      },
      {
        label: "Promotions",
        items: [
          {
            href: "/discounts" as Route,
            label: "Discounts",
            icon: BadgePercent,
            blurb: "Senior/PWD, promos, VAT rules",
            tone: "warning",
            permissionKey: "sales.discounts.view",
          },
          {
            href: "/loyalty" as Route,
            label: "Loyalty",
            icon: Gift,
            blurb: "Points, rewards, redemptions",
            tone: "accent",
            permissionKey: "sales.loyalty.view",
          },
        ],
      },
    ],
  },
  {
    label: "Finance Management",
    groups: [
      {
        label: null,
        items: [
          {
            href: "/cash-flow" as Route,
            label: "Cash Flow",
            icon: Banknote,
            blurb: "Cash in, cash out, expected cash",
            tone: "success",
            permissionKey: "finance.cash-flow.view",
          },
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
    ],
  },
  {
    label: "People Management",
    groups: [
      {
        label: null,
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
            href: "/attendance" as Route,
            label: "Attendance",
            icon: CalendarClock,
            blurb: "Schedules, clock-in/out, POS access",
            tone: "accent",
            featureKey: "attendance",
            permissionKey: "people.attendance.view",
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
    ],
  },
  {
    label: "Settings",
    groups: [
      {
        label: null,
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
    ],
  },
];

/** Flat group view, section headings dropped — kept for ClassicShell's per-group dropdown menu bar. */
export const NAV_GROUPS: NavGroup[] = NAV_SECTIONS.flatMap((section) => section.groups);

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

/** Same as filterNavGroupsByFeatures, one level up — for the sidebar's section → group → item tree. */
export function filterNavSectionsByFeatures(
  sections: NavSection[],
  isEnabled: (key: string) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      groups: filterNavGroupsByFeatures(section.groups, isEnabled),
    }))
    .filter((section) => section.groups.length > 0);
}

/** Same as filterNavGroupsByPermissions, one level up. */
export function filterNavSectionsByPermissions(
  sections: NavSection[],
  can: (permissionKey: string) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      groups: filterNavGroupsByPermissions(section.groups, can),
    }))
    .filter((section) => section.groups.length > 0);
}
