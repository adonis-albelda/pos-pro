"use client";

import { useMemo, useState } from "react";
import { ContactRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { EmployeeStatus } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { useCreateEmployee, useDeleteEmployee, useEmployees } from "@/lib/query/employees";
import { useUsers } from "@/lib/query/users";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export default function EmployeesPage() {
  const employeesQuery = useEmployees();
  const usersQuery = useUsers({ includeInactive: true });
  const createEmployee = useCreateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data ?? []) {
      map.set(user.id, user.name);
    }
    return map;
  }, [usersQuery.data]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ContactRound}
        title="Employees"
        description="HR profiles linked to a user login (user_id). Government IDs and hire details live here — not on the user row."
        action={
          <Button type="button" icon={Plus} onClick={() => setDrawerOpen(true)}>
            New employee
          </Button>
        }
      />

      <Sheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New employee"
        description="Link an HR profile to an existing user login."
        className="min-w-[36rem] max-w-3xl"
      >
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
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
          <Field label="Position">
            <Input name="position" />
          </Field>
          <Field label="Department">
            <Input name="department" />
          </Field>
          <Field label="Hire date">
            <Input name="hire_date" type="date" />
          </Field>
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
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createEmployee.isPending}>
              Save employee
            </Button>
          </div>
        </form>
      </Sheet>

      {employeesQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : employeesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(employeesQuery.error)}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
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
              {(employeesQuery.data ?? []).length === 0 ? (
                <tr>
                  <Td colSpan={6} className="py-8 text-center text-ink-muted">
                    No employees yet.
                  </Td>
                </tr>
              ) : (
                (employeesQuery.data ?? []).map((employee) => (
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
                      <button
                        type="button"
                        className="text-caption text-danger hover:underline"
                        onClick={() => {
                          deleteEmployee.mutate(employee.id, {
                            onSuccess: () => toast.success("Employee deleted."),
                            onError: (error) => toast.error(errorMessage(error)),
                          });
                        }}
                      >
                        Delete
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
