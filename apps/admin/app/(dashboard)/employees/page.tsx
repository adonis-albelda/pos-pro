"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ContactRound, Pencil, Plus, Save, Trash2, UserCheck, UserPlus, UserX, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { Employee, EmployeeStatus } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  StatCard,
  Table,
  TableSkeleton,
  Td,
  Th,
} from "@/components/ui";
import { Pagination, SearchField } from "@/components/record-list";
import { ConfirmDialog, Sheet } from "@/components/overlay";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { useCreateEmployee, useDeleteEmployee, useEmployees, useUpdateEmployee } from "@/lib/query/employees";
import { useUsers } from "@/lib/query/users";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

/** One titled block inside the New employee sheet — keeps related fields together. */
function FormGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="space-y-0.5">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="text-caption text-ink-muted">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function EmployeesPage() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const employeesQuery = useEmployees();
  const usersQuery = useUsers({ includeInactive: true });
  const createEmployee = useCreateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const employees = employeesQuery.data ?? [];
  const activeCount = employees.filter((employee) => employee.status === "active").length;
  const inactiveCount = employees.length - activeCount;

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data ?? []) {
      map.set(user.id, user.name);
    }
    return map;
  }, [usersQuery.data]);

  const filtered = employees.filter((employee) =>
    matchesQuery(
      [
        employee.firstName,
        employee.lastName,
        employee.employeeNumber,
        employee.position,
        userNameById.get(employee.userId),
      ],
      q,
    ),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await createEmployee.mutateAsync({
        userId: String(form.get("user_id") ?? ""),
        employeeNumber: String(form.get("employee_number") ?? "").trim() || null,
        firstName: String(form.get("first_name") ?? "").trim(),
        lastName: String(form.get("last_name") ?? "").trim(),
        middleName: String(form.get("middle_name") ?? "").trim() || null,
        phone: String(form.get("phone") ?? "").trim() || null,
        position: String(form.get("position") ?? "").trim() || null,
        department: String(form.get("department") ?? "").trim() || null,
        hireDate: String(form.get("hire_date") ?? "").trim() || null,
        status: String(form.get("status") ?? "active") as EmployeeStatus,
        sssNumber: String(form.get("sss_number") ?? "").trim() || null,
        philhealthNumber: String(form.get("philhealth_number") ?? "").trim() || null,
        pagibigNumber: String(form.get("pagibig_number") ?? "").trim() || null,
        tin: String(form.get("tin") ?? "").trim() || null,
      });
      toast.success("Employee created.");
      setDrawerOpen(false);
      (event.target as HTMLFormElement).reset();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteEmployee.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Employee deleted.");
        setDeleting(null);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={UsersRound}
          label="Total employees"
          value={String(employees.length)}
          loading={employeesQuery.isPending}
        />
        <StatCard
          icon={UserCheck}
          label="Active"
          value={String(activeCount)}
          tone="success"
          loading={employeesQuery.isPending}
        />
        <StatCard
          icon={UserX}
          label="Inactive / terminated"
          value={String(inactiveCount)}
          tone={inactiveCount > 0 ? "neutral" : "success"}
          loading={employeesQuery.isPending}
        />
      </div>

      <Sheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New employee"
        description="Link an HR profile to an existing user login."
        className="min-w-[36rem] max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" icon={X} onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-employee-form"
              icon={UserPlus}
              loading={createEmployee.isPending}
            >
              Save employee
            </Button>
          </div>
        }
      >
        <form id="new-employee-form" onSubmit={onCreate} className="space-y-6">
          <FormGroup
            title="Account"
            description="Which login this HR profile belongs to."
          >
            <div className="sm:col-span-2">
              <Field label="Linked user" required>
                <Select name="user_id" required defaultValue="">
                  <option value="" disabled>
                    Select user…
                  </option>
                  {(usersQuery.data ?? [])
                    .filter((user) => user.role !== "device" && user.role !== "superadmin")
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label="Employee number">
              <Input name="employee_number" />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </Select>
            </Field>
          </FormGroup>

          <FormGroup title="Profile" description="Legal name and contact.">
            <Field label="First name" required>
              <Input name="first_name" required />
            </Field>
            <Field label="Last name" required>
              <Input name="last_name" required />
            </Field>
            <Field label="Middle name">
              <Input name="middle_name" />
            </Field>
            <Field label="Phone">
              <Input name="phone" />
            </Field>
          </FormGroup>

          <FormGroup title="Employment" description="Role in the shop and when they started.">
            <Field label="Position">
              <Input name="position" />
            </Field>
            <Field label="Department">
              <Input name="department" />
            </Field>
            <Field label="Hire date">
              <Input name="hire_date" type="date" />
            </Field>
          </FormGroup>

          <FormGroup
            title="Government Benefits"
            description="SSS, PhilHealth, Pag-IBIG, and TIN for payroll and remittance."
          >
            <Field label="SSS">
              <Input name="sss_number" />
            </Field>
            <Field label="PhilHealth">
              <Input name="philhealth_number" />
            </Field>
            <Field label="Pag-IBIG">
              <Input name="pagibig_number" />
            </Field>
            <Field label="TIN">
              <Input name="tin" />
            </Field>
          </FormGroup>
        </form>
      </Sheet>

      {employeesQuery.isPending ? (
        <TableSkeleton columns={["w-32", "w-16", "w-24", "w-20", "w-16", "w-12"]} />
      ) : employeesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(employeesQuery.error)}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardHeader
            icon={ContactRound}
            title="Employees"
            description="HR profiles linked to a user login. Government IDs and hire details live here — not on the user row."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <SearchField placeholder="Search name, number, position…" defaultValue={q} />
                <Button type="button" icon={Plus} onClick={() => setDrawerOpen(true)}>
                  New employee
                </Button>
              </div>
            }
          />

          {total === 0 ? (
            <EmptyState
              icon={UsersRound}
              title={q ? "Nothing matches that search" : "No employees yet"}
              instruction={
                q
                  ? "Try a different name, number, or position."
                  : "HR profiles hold name, position, hire date, and government IDs — linked to a user login. Create one to start tracking payroll and remittance details."
              }
              action={
                !q ? (
                  <Button type="button" icon={Plus} onClick={() => setDrawerOpen(true)}>
                    Create Employee
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Number</Th>
                    <Th>User</Th>
                    <Th>Position</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((employee) => (
                    <tr key={employee.id} className="border-t border-border">
                      <Td className="font-medium text-ink">
                        {employee.lastName}, {employee.firstName}
                        {employee.middleName ? ` ${employee.middleName}` : ""}
                      </Td>
                      <Td className="font-mono text-caption">{employee.employeeNumber ?? "—"}</Td>
                      <Td className="text-caption text-ink-muted">
                        {userNameById.get(employee.userId) ?? employee.userId.slice(0, 8)}
                      </Td>
                      <Td>{employee.position ?? "—"}</Td>
                      <Td>
                        <Badge tone={employee.status === "active" ? "success" : "neutral"}>
                          {employee.status}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <IconButton icon={Pencil} label="Edit employee" onClick={() => setEditing(employee)} />
                          <IconButton
                            icon={Trash2}
                            label="Delete employee"
                            tone="danger"
                            onClick={() => setDeleting(employee)}
                          />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={safePage}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                basePath="/employees"
                query={{ q: q || undefined }}
              />
            </>
          )}
        </Card>
      )}

      <EditEmployeeSheet employee={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deleteEmployee.isPending}
        title="Delete employee?"
        description={
          deleting
            ? `${deleting.firstName} ${deleting.lastName}'s HR profile is removed from the directory. This is a soft delete — restorable from the database if needed, but there is no Undo in this screen.`
            : ""
        }
        confirmLabel="Delete employee"
      />
    </div>
  );
}

function EditEmployeeSheet({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const updateEmployee = useUpdateEmployee();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    const form = new FormData(event.currentTarget);
    try {
      await updateEmployee.mutateAsync({
        id: employee.id,
        input: {
          employeeNumber: String(form.get("employee_number") ?? "").trim() || null,
          firstName: String(form.get("first_name") ?? "").trim(),
          lastName: String(form.get("last_name") ?? "").trim(),
          middleName: String(form.get("middle_name") ?? "").trim() || null,
          phone: String(form.get("phone") ?? "").trim() || null,
          position: String(form.get("position") ?? "").trim() || null,
          department: String(form.get("department") ?? "").trim() || null,
          hireDate: String(form.get("hire_date") ?? "").trim() || null,
          status: String(form.get("status") ?? "active") as EmployeeStatus,
          sssNumber: String(form.get("sss_number") ?? "").trim() || null,
          philhealthNumber: String(form.get("philhealth_number") ?? "").trim() || null,
          pagibigNumber: String(form.get("pagibig_number") ?? "").trim() || null,
          tin: String(form.get("tin") ?? "").trim() || null,
        },
      });
      toast.success("Employee saved.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Sheet
      open={employee !== null}
      onClose={onClose}
      title={employee ? `${employee.firstName} ${employee.lastName}` : "Edit employee"}
      description="The linked user login can't be changed here — delete and recreate to relink."
      className="min-w-[36rem] max-w-3xl"
      footer={
        employee ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" icon={X} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="edit-employee-form" icon={Save} loading={updateEmployee.isPending}>
              Save employee
            </Button>
          </div>
        ) : null
      }
    >
      {employee ? (
        <form id="edit-employee-form" onSubmit={onSubmit} className="space-y-6">
          <FormGroup title="Profile" description="Legal name and contact.">
            <Field label="First name" required>
              <Input name="first_name" defaultValue={employee.firstName} required />
            </Field>
            <Field label="Last name" required>
              <Input name="last_name" defaultValue={employee.lastName} required />
            </Field>
            <Field label="Middle name">
              <Input name="middle_name" defaultValue={employee.middleName ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={employee.phone ?? ""} />
            </Field>
          </FormGroup>

          <FormGroup
            title="Account"
            description="Employee number and status — the linked login is fixed at create."
          >
            <Field label="Employee number">
              <Input name="employee_number" defaultValue={employee.employeeNumber ?? ""} />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={employee.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </Select>
            </Field>
          </FormGroup>

          <FormGroup title="Employment" description="Role in the shop and when they started.">
            <Field label="Position">
              <Input name="position" defaultValue={employee.position ?? ""} />
            </Field>
            <Field label="Department">
              <Input name="department" defaultValue={employee.department ?? ""} />
            </Field>
            <Field label="Hire date">
              <Input name="hire_date" type="date" defaultValue={employee.hireDate ?? ""} />
            </Field>
          </FormGroup>

          <FormGroup
            title="Government Benefits"
            description="SSS, PhilHealth, Pag-IBIG, and TIN for payroll and remittance."
          >
            <Field label="SSS">
              <Input name="sss_number" defaultValue={employee.sssNumber ?? ""} />
            </Field>
            <Field label="PhilHealth">
              <Input name="philhealth_number" defaultValue={employee.philhealthNumber ?? ""} />
            </Field>
            <Field label="Pag-IBIG">
              <Input name="pagibig_number" defaultValue={employee.pagibigNumber ?? ""} />
            </Field>
            <Field label="TIN">
              <Input name="tin" defaultValue={employee.tin ?? ""} />
            </Field>
          </FormGroup>
        </form>
      ) : null}
    </Sheet>
  );
}
