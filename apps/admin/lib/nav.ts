import type { Route } from "next";
import {
  ArrowLeftRight,
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
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * One nav definition, read by both shells. Categories sit under Settings with
 * company details: both shape how the shop is set up, not day-to-day selling.
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
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        blurb: "Stock counts and movements",
        tone: "success",
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
      },
      {
        href: "/purchase-orders" as Route,
        label: "Purchase orders",
        icon: ClipboardList,
        blurb: "Terms, balances, receiving",
        tone: "warning",
        featureKey: "purchase_orders",
      },
      {
        href: "/receiving" as Route,
        label: "Receive orders",
        icon: PackageCheck,
        blurb: "Log a delivery, restock, adjust prices",
        tone: "success",
        featureKey: "purchase_orders",
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
      },
      {
        href: "/sales/new" as Route,
        label: "New sale",
        icon: Plus,
        blurb: "Ring up a phone order",
        tone: "primary",
      },
      {
        href: "/customers" as Route,
        label: "Customers",
        icon: ContactRound,
        blurb: "Names, addresses, contacts",
        tone: "neutral",
      },
      {
        href: "/expenses" as Route,
        label: "Expenses",
        icon: Wallet,
        blurb: "Rent, wages, utilities",
        tone: "danger",
        featureKey: "expenses",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: ChartColumn,
        blurb: "Profit, discounts, dead stock",
        tone: "warning",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/locations" as Route,
        label: "Locations",
        icon: MapPin,
        blurb: "Branches and warehouses",
        tone: "neutral",
      },
      {
        href: "/stock-transfers" as Route,
        label: "Stock transfers",
        icon: ArrowLeftRight,
        blurb: "Move stock between locations",
        tone: "success",
      },
      {
        href: "/users",
        label: "Users",
        icon: Users,
        blurb: "Cashiers, admins, terminals",
        tone: "primary",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/categories",
        label: "Categories",
        icon: FolderTree,
        blurb: "Shelf tree and markup",
        tone: "success",
      },
      {
        href: "/attributes" as Route,
        label: "Choices",
        icon: Tags,
        blurb: "Size, color — build the vocabulary for variants",
        tone: "accent",
      },
      {
        href: "/addon-groups" as Route,
        label: "Add-on groups",
        icon: Layers,
        blurb: "Toppings, accessories — merchant-configurable extras",
        tone: "warning",
      },
      {
        href: "/settings",
        label: "Company",
        icon: Store,
        blurb: "Shop name, logo, receipt footer",
        tone: "neutral",
      },
      {
        href: "/receipt" as Route,
        label: "Receipt layout",
        icon: Printer,
        blurb: "PT-210 blocks and preview",
        tone: "warning",
      },
      {
        href: "/product-qr" as Route,
        label: "Product QR codes",
        icon: QrCode,
        blurb: "Print SKU QR sheets",
        tone: "accent",
      },
      {
        href: "/export" as Route,
        label: "Export data",
        icon: Download,
        blurb: "CSV, Excel or PDF backup",
        tone: "primary",
        featureKey: "export",
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
