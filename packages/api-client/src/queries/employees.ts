import type { Employee, EmployeeStatus, Terminal, TerminalStatus } from "@double-a/shared-types";
import type { ApiClient, JsonApiResource } from "../http";

interface EmployeeAttrs {
  user_id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  hire_date: string | null;
  status: string;
  sss_number: string | null;
  philhealth_number: string | null;
  pagibig_number: string | null;
  tin: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function toEmployee(resource: JsonApiResource<EmployeeAttrs>): Employee {
  const a = resource.attributes;
  return {
    id: resource.id,
    userId: a.user_id,
    employeeNumber: a.employee_number,
    firstName: a.first_name,
    lastName: a.last_name,
    middleName: a.middle_name,
    phone: a.phone,
    position: a.position,
    department: a.department,
    hireDate: a.hire_date,
    status: a.status as EmployeeStatus,
    sssNumber: a.sss_number,
    philhealthNumber: a.philhealth_number,
    pagibigNumber: a.pagibig_number,
    tin: a.tin,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export async function listEmployees(client: ApiClient): Promise<Employee[]> {
  const { data } = await client.get<{ data: JsonApiResource<EmployeeAttrs>[] }>("/employees");
  return data.map(toEmployee);
}

export interface UpsertEmployeeInput {
  userId: string;
  employeeNumber?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  hireDate?: string | null;
  status?: EmployeeStatus;
  sssNumber?: string | null;
  philhealthNumber?: string | null;
  pagibigNumber?: string | null;
  tin?: string | null;
}

function toEmployeePayload(input: UpsertEmployeeInput): Record<string, unknown> {
  return {
    user_id: input.userId,
    employee_number: input.employeeNumber ?? null,
    first_name: input.firstName,
    last_name: input.lastName,
    middle_name: input.middleName ?? null,
    phone: input.phone ?? null,
    position: input.position ?? null,
    department: input.department ?? null,
    hire_date: input.hireDate ?? null,
    status: input.status ?? "active",
    sss_number: input.sssNumber ?? null,
    philhealth_number: input.philhealthNumber ?? null,
    pagibig_number: input.pagibigNumber ?? null,
    tin: input.tin ?? null,
  };
}

export async function createEmployee(client: ApiClient, input: UpsertEmployeeInput): Promise<Employee> {
  const { data } = await client.post<{ data: JsonApiResource<EmployeeAttrs> }>(
    "/employees",
    toEmployeePayload(input),
  );
  return toEmployee(data);
}

export async function updateEmployee(
  client: ApiClient,
  id: string,
  input: Partial<UpsertEmployeeInput>,
): Promise<Employee> {
  const payload: Record<string, unknown> = {};
  if (input.userId !== undefined) payload.user_id = input.userId;
  if (input.employeeNumber !== undefined) payload.employee_number = input.employeeNumber;
  if (input.firstName !== undefined) payload.first_name = input.firstName;
  if (input.lastName !== undefined) payload.last_name = input.lastName;
  if (input.middleName !== undefined) payload.middle_name = input.middleName;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.position !== undefined) payload.position = input.position;
  if (input.department !== undefined) payload.department = input.department;
  if (input.hireDate !== undefined) payload.hire_date = input.hireDate;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sssNumber !== undefined) payload.sss_number = input.sssNumber;
  if (input.philhealthNumber !== undefined) payload.philhealth_number = input.philhealthNumber;
  if (input.pagibigNumber !== undefined) payload.pagibig_number = input.pagibigNumber;
  if (input.tin !== undefined) payload.tin = input.tin;
  const { data } = await client.patch<{ data: JsonApiResource<EmployeeAttrs> }>(
    `/employees/${id}`,
    payload,
  );
  return toEmployee(data);
}

export async function deleteEmployee(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/employees/${id}`);
}

interface TerminalAttrs {
  user_id: string | null;
  name: string;
  code: string;
  device_identifier: string | null;
  location_id: string | null;
  status: string;
  last_active_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function toTerminal(resource: JsonApiResource<TerminalAttrs>): Terminal {
  const a = resource.attributes;
  return {
    id: resource.id,
    userId: a.user_id,
    name: a.name,
    code: a.code,
    deviceIdentifier: a.device_identifier,
    locationId: a.location_id,
    status: a.status as TerminalStatus,
    lastActiveAt: a.last_active_at,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export async function listTerminals(
  client: ApiClient,
  options: { userId?: string } = {},
): Promise<Terminal[]> {
  const params = options.userId ? `?user_id=${encodeURIComponent(options.userId)}` : "";
  const { data } = await client.get<{ data: JsonApiResource<TerminalAttrs>[] }>(`/terminals${params}`);
  return data.map(toTerminal);
}

export interface UpsertTerminalInput {
  userId?: string | null;
  name: string;
  code: string;
  deviceIdentifier?: string | null;
  locationId?: string | null;
  status?: TerminalStatus;
}

export async function createTerminal(client: ApiClient, input: UpsertTerminalInput): Promise<Terminal> {
  const { data } = await client.post<{ data: JsonApiResource<TerminalAttrs> }>("/terminals", {
    user_id: input.userId ?? null,
    name: input.name,
    code: input.code,
    device_identifier: input.deviceIdentifier ?? null,
    location_id: input.locationId ?? null,
    status: input.status ?? "active",
  });
  return toTerminal(data);
}

export async function updateTerminal(
  client: ApiClient,
  id: string,
  input: Partial<UpsertTerminalInput>,
): Promise<Terminal> {
  const payload: Record<string, unknown> = {};
  if (input.userId !== undefined) payload.user_id = input.userId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.code !== undefined) payload.code = input.code;
  if (input.deviceIdentifier !== undefined) payload.device_identifier = input.deviceIdentifier;
  if (input.locationId !== undefined) payload.location_id = input.locationId;
  if (input.status !== undefined) payload.status = input.status;
  const { data } = await client.patch<{ data: JsonApiResource<TerminalAttrs> }>(
    `/terminals/${id}`,
    payload,
  );
  return toTerminal(data);
}

export async function deleteTerminal(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/terminals/${id}`);
}
