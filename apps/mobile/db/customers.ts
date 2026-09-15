import type { Customer, CustomerGender, SyncStatus } from "@double-a/shared-types";
import { getDb } from "./index";

interface CustomerRow {
  id: string;
  name: string;
  address: string | null;
  contact: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  id_number: string | null;
  cardholder_name: string | null;
  is_pwd_eligible: number;
  is_senior_eligible: number;
  loyalty_points_balance: number;
  updated_at: string | null;
  sync_status: string;
}

export interface LocalCustomer extends Customer {
  syncStatus: SyncStatus;
}

function toLocal(row: CustomerRow): LocalCustomer {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contact: row.contact,
    email: row.email,
    dateOfBirth: row.date_of_birth,
    gender: (row.gender as CustomerGender | null) ?? null,
    notes: row.notes,
    isActive: true,
    idNumber: row.id_number,
    cardholderName: row.cardholder_name,
    isPwdEligible: row.is_pwd_eligible === 1,
    isSeniorEligible: row.is_senior_eligible === 1,
    loyaltyPointsBalance: row.loyalty_points_balance,
    lifetimePointsEarned: 0,
    lifetimePointsRedeemed: 0,
    updatedAt: row.updated_at ?? "",
    syncStatus: row.sync_status as SyncStatus,
  };
}

/** Customers the DiscountSheet PWD/Senior pickers show — the reasoning that gates them lives on Customer's own isPwdEligible/isSeniorEligible fields (packages/shared-types). */
export async function listMandatoryDiscountEligibleCustomers(
  eligibility: "pwd" | "senior",
): Promise<LocalCustomer[]> {
  const column = eligibility === "pwd" ? "is_pwd_eligible" : "is_senior_eligible";
  const rows = await getDb().getAllAsync<CustomerRow>(
    `SELECT * FROM customers WHERE ${column} = 1 ORDER BY name COLLATE NOCASE`,
  );
  return rows.map(toLocal);
}

export async function listLocalCustomers(): Promise<LocalCustomer[]> {
  const rows = await getDb().getAllAsync<CustomerRow>(
    "SELECT * FROM customers ORDER BY name COLLATE NOCASE",
  );
  return rows.map(toLocal);
}

export async function getLocalCustomer(id: string): Promise<LocalCustomer | null> {
  const row = await getDb().getFirstAsync<CustomerRow>(
    "SELECT * FROM customers WHERE id = ?",
    id,
  );
  return row ? toLocal(row) : null;
}

export async function searchLocalCustomers(query: string): Promise<LocalCustomer[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return listLocalCustomers();

  const needle = `%${trimmed}%`;
  const rows = await getDb().getAllAsync<CustomerRow>(
    `SELECT * FROM customers
      WHERE lower(name) LIKE ?
         OR lower(coalesce(contact, '')) LIKE ?
         OR lower(coalesce(address, '')) LIKE ?
         OR lower(coalesce(email, '')) LIKE ?
      ORDER BY name COLLATE NOCASE
      LIMIT 40`,
    needle,
    needle,
    needle,
    needle,
  );
  return rows.map(toLocal);
}

/**
 * Create or update a customer on-device. New rows and edits are pending until
 * the next push; a pull must not wipe them.
 *
 * Profile fields (email/DOB/gender/notes) are optional — omit them on a sale
 * finish upsert so an earlier sheet save is not wiped to null. Push still only
 * sends name/address/contact (PushCustomersRequest); profile fields round-trip
 * via pull after admin edits.
 */
export async function upsertLocalCustomer(input: {
  id: string;
  name: string;
  address: string | null;
  contact: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: CustomerGender | null;
  notes?: string | null;
  idNumber?: string | null;
  cardholderName?: string | null;
  isPwdEligible?: boolean;
  isSeniorEligible?: boolean;
  /** Fresh local write — always pending. Pulls write with synced. */
  pending?: boolean;
  updatedAt?: string;
}): Promise<LocalCustomer> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const syncStatus = input.pending === false ? "synced" : "pending";
  const existing = await getLocalCustomer(input.id);

  const email = input.email !== undefined ? input.email : (existing?.email ?? null);
  const dateOfBirth =
    input.dateOfBirth !== undefined ? input.dateOfBirth : (existing?.dateOfBirth ?? null);
  const gender = input.gender !== undefined ? input.gender : (existing?.gender ?? null);
  const notes = input.notes !== undefined ? input.notes : (existing?.notes ?? null);
  const idNumber = input.idNumber !== undefined ? input.idNumber : (existing?.idNumber ?? null);
  const cardholderName =
    input.cardholderName !== undefined ? input.cardholderName : (existing?.cardholderName ?? null);
  const isPwdEligible =
    input.isPwdEligible !== undefined ? input.isPwdEligible : (existing?.isPwdEligible ?? false);
  const isSeniorEligible =
    input.isSeniorEligible !== undefined ? input.isSeniorEligible : (existing?.isSeniorEligible ?? false);
  const loyaltyPointsBalance = existing?.loyaltyPointsBalance ?? 0;

  await getDb().runAsync(
    `INSERT INTO customers (
       id, name, address, contact, email, date_of_birth, gender, notes,
       id_number, cardholder_name, is_pwd_eligible, is_senior_eligible,
       loyalty_points_balance, updated_at, sync_status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       address = excluded.address,
       contact = excluded.contact,
       email = excluded.email,
       date_of_birth = excluded.date_of_birth,
       gender = excluded.gender,
       notes = excluded.notes,
       id_number = excluded.id_number,
       cardholder_name = excluded.cardholder_name,
       is_pwd_eligible = excluded.is_pwd_eligible,
       is_senior_eligible = excluded.is_senior_eligible,
       updated_at = excluded.updated_at,
       sync_status = CASE
         WHEN excluded.sync_status = 'pending' THEN 'pending'
         ELSE excluded.sync_status
       END`,
    input.id,
    input.name,
    input.address,
    input.contact,
    email,
    dateOfBirth,
    gender,
    notes,
    idNumber,
    cardholderName,
    isPwdEligible ? 1 : 0,
    isSeniorEligible ? 1 : 0,
    loyaltyPointsBalance,
    updatedAt,
    syncStatus,
  );

  return {
    id: input.id,
    name: input.name,
    address: input.address,
    contact: input.contact,
    email,
    dateOfBirth,
    gender,
    notes,
    idNumber,
    cardholderName,
    isPwdEligible,
    isSeniorEligible,
    isActive: true,
    loyaltyPointsBalance,
    lifetimePointsEarned: existing?.lifetimePointsEarned ?? 0,
    lifetimePointsRedeemed: existing?.lifetimePointsRedeemed ?? 0,
    updatedAt,
    syncStatus: syncStatus as SyncStatus,
  };
}

export async function listPendingCustomers(): Promise<LocalCustomer[]> {
  const rows = await getDb().getAllAsync<CustomerRow>(
    "SELECT * FROM customers WHERE sync_status = 'pending' ORDER BY updated_at",
  );
  return rows.map(toLocal);
}

export async function markCustomersSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await getDb().runAsync(
    `UPDATE customers SET sync_status = 'synced' WHERE id IN (${placeholders})`,
    ...ids,
  );
}

/**
 * Replace pulled customers without wiping ones still waiting to push.
 */
export async function replaceSyncedCustomers(customers: Customer[]): Promise<void> {
  const db = getDb();
  const pulledIds = new Set(customers.map((customer) => customer.id));

  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<{ id: string; sync_status: string }>(
      "SELECT id, sync_status FROM customers",
    );

    for (const row of existing) {
      if (row.sync_status === "pending") continue;
      if (!pulledIds.has(row.id)) {
        await db.runAsync("DELETE FROM customers WHERE id = ?", row.id);
      }
    }

    for (const customer of customers) {
      const local = await db.getFirstAsync<{ sync_status: string }>(
        "SELECT sync_status FROM customers WHERE id = ?",
        customer.id,
      );
      // A pending local edit wins until it pushes — otherwise a mid-sync pull
      // would overwrite the cashier's new address with the old server copy.
      if (local?.sync_status === "pending") continue;

      await db.runAsync(
        `INSERT INTO customers (
           id, name, address, contact, email, date_of_birth, gender, notes,
           id_number, cardholder_name, is_pwd_eligible, is_senior_eligible,
           loyalty_points_balance, updated_at, sync_status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           contact = excluded.contact,
           email = excluded.email,
           date_of_birth = excluded.date_of_birth,
           gender = excluded.gender,
           notes = excluded.notes,
           id_number = excluded.id_number,
           cardholder_name = excluded.cardholder_name,
           is_pwd_eligible = excluded.is_pwd_eligible,
           is_senior_eligible = excluded.is_senior_eligible,
           loyalty_points_balance = excluded.loyalty_points_balance,
           updated_at = excluded.updated_at,
           sync_status = 'synced'`,
        customer.id,
        customer.name,
        customer.address,
        customer.contact,
        customer.email,
        customer.dateOfBirth,
        customer.gender,
        customer.notes,
        customer.idNumber,
        customer.cardholderName,
        customer.isPwdEligible ? 1 : 0,
        customer.isSeniorEligible ? 1 : 0,
        customer.loyaltyPointsBalance,
        customer.updatedAt,
      );
    }
  });
}
